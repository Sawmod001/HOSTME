-- Migration: Batch 11 — Document Engine
-- Receipts, invoices, terms & conditions documents

BEGIN;

-- === 1. CREATE documents TABLE ===
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('receipt', 'invoice', 'booking_confirmation', 'cancellation_receipt', 'terms_and_conditions')),
  file_url TEXT,
  file_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'sent', 'downloaded')),
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_booking ON documents (booking_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (document_type);
CREATE INDEX IF NOT EXISTS idx_documents_booking_type ON documents (booking_id, document_type);

-- === 2. RLS FOR documents ===
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Guest can read documents for their bookings
CREATE POLICY documents_guest_read ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = documents.booking_id
        AND b.guest_id = auth.uid()
    )
  );

-- Host can read documents for their listings' bookings
CREATE POLICY documents_host_read ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE b.id = documents.booking_id
        AND pp.user_id = auth.uid()
    )
  );

-- Admin can read all
CREATE POLICY documents_admin_read ON documents
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- System can insert
CREATE POLICY documents_system_insert ON documents
  FOR INSERT
  WITH CHECK (true);

-- Host/system can update
CREATE POLICY documents_update ON documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE b.id = documents.booking_id
        AND pp.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 3. TRIGGER for updated_at ===
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_documents_updated_at();

-- === 4. HELPER FUNCTION: generate_receipt ===
-- Generates a receipt document for a completed/paid booking
CREATE OR REPLACE FUNCTION generate_receipt(p_booking_id UUID, p_generated_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_listing RECORD;
  v_guest RECORD;
  v_payment RECORD;
  v_doc_id UUID;
  v_content JSONB;
BEGIN
  -- Fetch booking with all needed data
  SELECT b.id, b.listing_id, b.guest_id, b.booking_type, b.event_start, b.event_end,
         b.headcount, b.total_amount_kobo, b.commission_kobo, b.pricing_snapshot,
         b.terms_snapshot, b.paid_at, b.gateway_transaction_ref, b.created_at
  INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;

  -- Fetch listing
  SELECT id, title, vertical, location
  INTO v_listing
  FROM listings WHERE id = v_booking.listing_id;

  -- Fetch guest
  SELECT id, full_name, email
  INTO v_guest
  FROM users WHERE id = v_booking.guest_id;

  -- Fetch payment
  SELECT amount_kobo, status, gateway_transaction_ref, paid_at
  INTO v_payment
  FROM payment_records
  WHERE booking_id = p_booking_id AND status = 'successful'
  LIMIT 1;

  -- Build receipt content
  v_content := jsonb_build_object(
    'receipt_number', 'RCP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || UPPER(SUBSTR(v_booking.id::text, 1, 8)),
    'booking_id', v_booking.id,
    'booking_type', v_booking.booking_type,
    'issued_at', now(),
    'guest', jsonb_build_object(
      'name', v_guest.full_name,
      'email', v_guest.email
    ),
    'listing', jsonb_build_object(
      'title', v_listing.title,
      'vertical', v_listing.vertical,
      'location', COALESCE(v_listing.location->>'cityArea', '') || ', ' || COALESCE(v_listing.location->>'state', '')
    ),
    'event', jsonb_build_object(
      'start', v_booking.event_start,
      'end', v_booking.event_end,
      'headcount', v_booking.headcount
    ),
    'pricing', jsonb_build_object(
      'subtotal', v_booking.total_amount_kobo - COALESCE(v_booking.commission_kobo, 0),
      'service_fee', v_booking.commission_kobo,
      'total', v_booking.total_amount_kobo,
      'currency', 'NGN',
      'breakdown', v_booking.pricing_snapshot
    ),
    'payment', jsonb_build_object(
      'amount', COALESCE(v_payment.amount_kobo, v_booking.total_amount_kobo),
      'status', COALESCE(v_payment.status, 'unknown'),
      'reference', COALESCE(v_payment.gateway_transaction_ref, v_booking.gateway_transaction_ref),
      'paid_at', COALESCE(v_payment.paid_at, v_booking.paid_at)
    ),
    'terms', v_booking.terms_snapshot
  );

  -- Insert document
  INSERT INTO documents (booking_id, document_type, file_content, generated_by, generated_at)
  VALUES (p_booking_id, 'receipt', v_content, p_generated_by, now())
  RETURNING id INTO v_doc_id;

  RETURN jsonb_build_object(
    'ok', true,
    'document_id', v_doc_id,
    'document_type', 'receipt',
    'content', v_content
  );
END;
$$;

-- === 5. HELPER FUNCTION: generate_booking_confirmation ===
CREATE OR REPLACE FUNCTION generate_booking_confirmation(p_booking_id UUID, p_generated_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_listing RECORD;
  v_guest RECORD;
  v_doc_id UUID;
  v_content JSONB;
BEGIN
  SELECT b.id, b.listing_id, b.guest_id, b.booking_type, b.status,
         b.event_start, b.event_end, b.headcount, b.total_amount_kobo,
         b.terms_snapshot, b.created_at
  INTO v_booking
  FROM bookings b WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;

  SELECT id, title, vertical, location INTO v_listing FROM listings WHERE id = v_booking.listing_id;
  SELECT id, full_name, email INTO v_guest FROM users WHERE id = v_booking.guest_id;

  v_content := jsonb_build_object(
    'confirmation_number', 'CNF-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || UPPER(SUBSTR(v_booking.id::text, 1, 8)),
    'booking_id', v_booking.id,
    'booking_type', v_booking.booking_type,
    'status', v_booking.status,
    'issued_at', now(),
    'guest', jsonb_build_object('name', v_guest.full_name, 'email', v_guest.email),
    'listing', jsonb_build_object(
      'title', v_listing.title,
      'vertical', v_listing.vertical,
      'location', COALESCE(v_listing.location->>'cityArea', '') || ', ' || COALESCE(v_listing.location->>'state', '')
    ),
    'event', jsonb_build_object(
      'start', v_booking.event_start,
      'end', v_booking.event_end,
      'headcount', v_booking.headcount
    ),
    'total_kobo', v_booking.total_amount_kobo,
    'terms', v_booking.terms_snapshot
  );

  INSERT INTO documents (booking_id, document_type, file_content, generated_by, generated_at)
  VALUES (p_booking_id, 'booking_confirmation', v_content, p_generated_by, now())
  RETURNING id INTO v_doc_id;

  RETURN jsonb_build_object(
    'ok', true,
    'document_id', v_doc_id,
    'document_type', 'booking_confirmation',
    'content', v_content
  );
END;
$$;

COMMIT;
