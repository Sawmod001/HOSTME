-- Migration: Batch 22 — Disputes
-- Dispute resolution, evidence, admin mediation

BEGIN;

-- === 1. CREATE disputes TABLE ===
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  filed_by UUID NOT NULL REFERENCES users(id),
  against_user_id UUID REFERENCES users(id),
  dispute_type TEXT NOT NULL
    CHECK (dispute_type IN (
      'no_show', 'property_damage', 'cleanliness', 'noise_complaint',
      'wrong_property', 'unlisted_charges', 'safety_concern', 'other'
    )),
  description TEXT NOT NULL CHECK (length(description) >= 20 AND length(description) <= 5000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'awaiting_response', 'resolved', 'escalated', 'dismissed')),
  resolution TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  guest_response TEXT,
  host_response TEXT,
  admin_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_booking ON disputes (booking_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_by ON disputes (filed_by);

-- === 2. CREATE dispute_evidence TABLE ===
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id),
  evidence_type TEXT NOT NULL
    CHECK (evidence_type IN ('photo', 'video', 'document', 'message_screenshot', 'other')),
  file_url TEXT,
  description TEXT CHECK (length(description) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id);

-- === 3. RLS POLICIES ===
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_evidence ENABLE ROW LEVEL SECURITY;

-- Disputes: participant can read
CREATE POLICY disputes_read ON disputes
  FOR SELECT
  USING (
    filed_by = auth.uid()
    OR against_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE b.id = disputes.booking_id
        AND (b.guest_id = auth.uid() OR pp.user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Disputes: authenticated users can insert
CREATE POLICY disputes_insert ON disputes
  FOR INSERT
  WITH CHECK (filed_by = auth.uid());

-- Disputes: participant or admin can update
CREATE POLICY disputes_update ON disputes
  FOR UPDATE
  USING (
    filed_by = auth.uid()
    OR against_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Evidence: participant can read
CREATE POLICY evidence_read ON dispute_evidence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id = dispute_evidence.dispute_id
        AND (
          d.filed_by = auth.uid()
          OR d.against_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );

-- Evidence: participant can insert
CREATE POLICY evidence_insert ON dispute_evidence
  FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id = dispute_evidence.dispute_id
        AND (d.filed_by = auth.uid() OR d.against_user_id = auth.uid())
        AND d.status IN ('open', 'under_review', 'awaiting_response')
    )
  );

-- === 4. FILE DISPUTE FUNCTION ===
CREATE OR REPLACE FUNCTION file_dispute(
  p_booking_id UUID,
  p_filed_by UUID,
  p_dispute_type TEXT,
  p_description TEXT,
  p_against_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_dispute_id UUID;
  v_booking RECORD;
BEGIN
  -- Fetch booking
  SELECT id, guest_id, listing_id, status INTO v_booking
  FROM bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;

  -- Verify filer is participant
  IF v_booking.guest_id != p_filed_by THEN
    -- Check if host
    IF NOT EXISTS(
      SELECT 1 FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE l.id = v_booking.listing_id AND pp.user_id = p_filed_by
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not a participant in this booking');
    END IF;
  END IF;

  -- Check for existing open dispute
  IF EXISTS(
    SELECT 1 FROM disputes
    WHERE booking_id = p_booking_id
      AND status IN ('open', 'under_review', 'awaiting_response')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'An open dispute already exists for this booking');
  END IF;

  -- Create dispute
  INSERT INTO disputes (booking_id, filed_by, against_user_id, dispute_type, description, status)
  VALUES (p_booking_id, p_filed_by, p_against_user_id, p_dispute_type, p_description, 'open')
  RETURNING id INTO v_dispute_id;

  -- Notify the other party
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  SELECT
    CASE WHEN p_filed_by = v_booking.guest_id THEN pp.user_id ELSE v_booking.guest_id END,
    'dispute_filed',
    'Dispute Filed',
    'A dispute has been filed for a booking.',
    '/dashboard',
    jsonb_build_object('dispute_id', v_dispute_id, 'booking_id', p_booking_id)
  FROM listings l
  JOIN provider_profiles pp ON pp.id = l.provider_profile_id
  WHERE l.id = v_booking.listing_id;

  -- Notify admin
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  SELECT
    u.id,
    'dispute_filed',
    'New Dispute',
    'A new dispute has been filed and needs review.',
    '/admin/disputes',
    jsonb_build_object('dispute_id', v_dispute_id, 'booking_id', p_booking_id)
  FROM users u
  WHERE u.role = 'admin'
  LIMIT 1;

  RETURN jsonb_build_object('ok', true, 'dispute_id', v_dispute_id);
END;
$$;

-- === 5. RESPOND TO DISPUTE FUNCTION ===
CREATE OR REPLACE FUNCTION respond_to_dispute(
  p_dispute_id UUID,
  p_user_id UUID,
  p_response TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_dispute RECORD;
BEGIN
  SELECT id, filed_by, against_user_id, status INTO v_dispute
  FROM disputes WHERE id = p_dispute_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dispute not found');
  END IF;

  -- Verify user is participant
  IF v_dispute.filed_by != p_user_id AND COALESCE(v_dispute.against_user_id, '00000000-0000-0000-0000-000000000000'::uuid) != p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a participant in this dispute');
  END IF;

  -- Check status
  IF v_dispute.status NOT IN ('open', 'under_review', 'awaiting_response') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dispute is not accepting responses');
  END IF;

  -- Update response
  IF v_dispute.filed_by = p_user_id THEN
    UPDATE disputes SET guest_response = p_response, status = 'awaiting_response' WHERE id = p_dispute_id;
  ELSE
    UPDATE disputes SET host_response = p_response, status = 'awaiting_response' WHERE id = p_dispute_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- === 6. RESOLVE DISPUTE FUNCTION (Admin) ===
CREATE OR REPLACE FUNCTION resolve_dispute(
  p_dispute_id UUID,
  p_admin_id UUID,
  p_resolution TEXT,
  p_action TEXT DEFAULT 'resolved'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_dispute RECORD;
BEGIN
  -- Verify admin
  IF NOT EXISTS(SELECT 1 FROM users WHERE id = p_admin_id AND role = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin role required');
  END IF;

  SELECT id, status INTO v_dispute
  FROM disputes WHERE id = p_dispute_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dispute not found');
  END IF;

  IF v_dispute.status IN ('resolved', 'dismissed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dispute already resolved');
  END IF;

  UPDATE disputes
  SET status = p_action,
      resolution = p_resolution,
      resolved_by = p_admin_id,
      resolved_at = now()
  WHERE id = p_dispute_id;

  -- Notify both parties
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  SELECT
    d.filed_by,
    'dispute_resolved',
    'Dispute Resolved',
    'Your dispute has been ' || p_action || '.',
    '/dashboard',
    jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution)
  FROM disputes d WHERE d.id = p_dispute_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- === 7. TRIGGER for updated_at ===
CREATE OR REPLACE FUNCTION update_disputes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS disputes_updated_at ON disputes;
CREATE TRIGGER disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_disputes_updated_at();

COMMIT;
