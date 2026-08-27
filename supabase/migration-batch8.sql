-- Migration: Batch 8 — Booking State Machine
-- Centralized status transitions with enforcement

BEGIN;

-- === 1. VALID TRANSITIONS TABLE ===
-- Canonical definition of which transitions are allowed
CREATE TABLE IF NOT EXISTS booking_valid_transitions (
  id SERIAL PRIMARY KEY,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('guest', 'host', 'admin', 'system')),
  description TEXT,
  UNIQUE (from_status, to_status, actor_role)
);

-- Seed the valid transitions
INSERT INTO booking_valid_transitions (from_status, to_status, actor_role, description) VALUES
  -- Guest actions
  ('awaiting_payment', 'cancelled', 'guest', 'Guest cancels before paying'),
  ('confirmed', 'cancelled', 'guest', 'Guest cancels a confirmed booking'),

  -- Host actions
  ('pending', 'awaiting_payment', 'host', 'Host approves a pending booking'),
  ('pending', 'rejected', 'host', 'Host rejects a pending booking'),
  ('confirmed', 'completed', 'host', 'Host marks booking as completed'),
  ('confirmed', 'cancelled', 'host', 'Host cancels a confirmed booking'),

  -- System actions
  ('awaiting_payment', 'cancelled', 'system', 'Payment window expired'),
  ('pending', 'cancelled', 'system', 'Approval window expired')

ON CONFLICT (from_status, to_status, actor_role) DO NOTHING;

-- === 2. TRANSITION BOOKING STATUS FUNCTION ===
-- Atomic function that validates and executes a status transition.
-- Returns the updated booking or an error.
CREATE OR REPLACE FUNCTION transition_booking_status(
  p_booking_id UUID,
  p_to_status TEXT,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_valid BOOLEAN;
  v_updated RECORD;
BEGIN
  -- Fetch current booking
  SELECT id, status, listing_id, guest_id, booking_type
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;

  -- Check if the transition is valid
  SELECT EXISTS(
    SELECT 1 FROM booking_valid_transitions
    WHERE from_status = v_booking.status
      AND to_status = p_to_status
      AND actor_role = p_actor_role
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Cannot transition from "%s" to "%s" as %s', v_booking.status, p_to_status, p_actor_role)
    );
  END IF;

  -- For host transitions, verify the actor owns the listing
  IF p_actor_role = 'host' THEN
    IF NOT EXISTS(
      SELECT 1 FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE l.id = v_booking.listing_id AND pp.user_id = p_actor_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You do not own this listing');
    END IF;
  END IF;

  -- For guest transitions, verify the actor is the guest
  IF p_actor_role = 'guest' THEN
    IF v_booking.guest_id != p_actor_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You are not the guest for this booking');
    END IF;
  END IF;

  -- Execute the transition
  UPDATE bookings
  SET status = p_to_status,
      rejection_reason = CASE WHEN p_to_status = 'rejected' THEN p_reason ELSE rejection_reason END,
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_updated;

  -- Log the transition (via trigger, but we also return it)
  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_updated.id,
    'from_status', v_booking.status,
    'to_status', v_updated.status,
    'booking_type', v_updated.booking_type
  );
END;
$$;

-- === 3. BOOKING CANCELLATION FUNCTION ===
-- Handles cancellation logic: release capacity, unblock dates, etc.
CREATE OR REPLACE FUNCTION cancel_booking(
  p_booking_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_booking RECORD;
BEGIN
  -- Attempt the status transition
  v_result := transition_booking_status(p_booking_id, 'cancelled', p_actor_id, p_actor_role, p_reason);

  IF NOT (v_result->>'ok')::boolean THEN
    RETURN v_result;
  END IF;

  -- Fetch booking details for side effects
  SELECT id, listing_id, slot_id, booking_type, event_start, event_end
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  -- Capacity booking: release the slot
  IF v_booking.booking_type = 'capacity' AND v_booking.slot_id IS NOT NULL THEN
    UPDATE slots
    SET status = 'open',
        reserved_by = NULL,
        reserved_at = NULL
    WHERE id = v_booking.slot_id
      AND status = 'reserved'
      AND reserved_by = p_booking_id;
  END IF;

  -- Housing booking: unblock dates
  IF v_booking.booking_type = 'housing' THEN
    DELETE FROM blocked_dates
    WHERE listing_id = v_booking.listing_id
      AND booking_id = p_booking_id
      AND reason IN ('booking_held', 'booking_confirmed');

    -- Restore tenancy period
    UPDATE tenancy_periods
    SET status = 'available',
        booking_id = NULL
    WHERE listing_id = v_booking.listing_id
      AND booking_id = p_booking_id;
  END IF;

  -- Exclusive lock: release
  IF v_booking.booking_type = 'exclusive' THEN
    UPDATE exclusive_locks
    SET status = 'open',
        booking_id = NULL,
        reserved_by = NULL,
        reserved_at = NULL
    WHERE booking_id = p_booking_id
      AND status = 'reserved';
  END IF;

  RETURN v_result;
END;
$$;

-- === 4. UPDATE EXISTING TRIGGER to use transition_booking_status ===
-- The existing log_booking_transition trigger logs after UPDATE, which still works.
-- We just ensure the transition is logged correctly.

-- === 5. INDEXES for performance ===
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_status_listing ON bookings (status, listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_status ON bookings (guest_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_expires_at ON bookings (expires_at)
  WHERE status = 'awaiting_payment';

COMMIT;
