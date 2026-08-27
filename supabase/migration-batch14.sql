-- Migration: Batch 14 — Trust & Safety
-- Reports, blocking, content moderation

BEGIN;

-- === 1. CREATE reports TABLE ===
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID REFERENCES users(id),
  reported_listing_id UUID REFERENCES listings(id),
  reported_booking_id UUID REFERENCES bookings(id),
  report_type TEXT NOT NULL
    CHECK (report_type IN (
      'inappropriate_content', 'fraud', 'harassment', 'fake_listing',
      'unsafe_property', 'payment_issue', 'no_show', 'other'
    )),
  reason TEXT NOT NULL CHECK (length(reason) >= 10 AND length(reason) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed', 'escalated')),
  resolution_note TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reports_target_check CHECK (
    (reported_user_id IS NOT NULL) OR (reported_listing_id IS NOT NULL) OR (reported_booking_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_listing ON reports (reported_listing_id)
  WHERE reported_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports (reported_user_id)
  WHERE reported_user_id IS NOT NULL;

-- === 2. RLS FOR reports ===
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Reporter can read their own reports
CREATE POLICY reports_reporter_read ON reports
  FOR SELECT
  USING (reporter_id = auth.uid());

-- Admin can read all reports
CREATE POLICY reports_admin_all ON reports
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Authenticated users can insert reports
CREATE POLICY reports_insert ON reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- === 3. CREATE blocked_users TABLE ===
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id),
  blocked_id UUID NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT blocked_users_no_self_block CHECK (blocker_id != blocked_id),
  CONSTRAINT blocked_users_unique UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users (blocked_id);

-- === 4. RLS FOR blocked_users ===
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can see who they blocked
CREATE POLICY blocked_users_own_read ON blocked_users
  FOR SELECT
  USING (blocker_id = auth.uid());

-- Users can block others
CREATE POLICY blocked_users_insert ON blocked_users
  FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

-- Users can unblock
CREATE POLICY blocked_users_delete ON blocked_users
  FOR DELETE
  USING (blocker_id = auth.uid());

-- === 5. CREATE content_flags TABLE ===
-- Flags for content that needs review (listings, reviews, messages)
CREATE TABLE IF NOT EXISTS content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('listing', 'review', 'message', 'profile')),
  content_id UUID NOT NULL,
  flag_type TEXT NOT NULL
    CHECK (flag_type IN ('auto_detected', 'user_reported', 'admin_flagged')),
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_flags_type ON content_flags (content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_flags_status ON content_flags (status);

-- === 6. RLS FOR content_flags ===
ALTER TABLE content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_flags_admin_all ON content_flags
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 7. HELPER FUNCTION: check_user_blocked ===
-- Check if two users have a block relationship
CREATE OR REPLACE FUNCTION check_user_blocked(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
END;
$$;

-- === 8. HELPER FUNCTION: create_report ===
-- Create a report with duplicate detection
CREATE OR REPLACE FUNCTION create_report(
  p_reporter_id UUID,
  p_report_type TEXT,
  p_reason TEXT,
  p_listing_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_booking_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_report_id UUID;
  v_existing UUID;
BEGIN
  -- Check for duplicate report (same reporter, same target, same type, last 24h)
  SELECT id INTO v_existing
  FROM reports
  WHERE reporter_id = p_reporter_id
    AND report_type = p_report_type
    AND (
      (p_listing_id IS NOT NULL AND reported_listing_id = p_listing_id)
      OR (p_user_id IS NOT NULL AND reported_user_id = p_user_id)
      OR (p_booking_id IS NOT NULL AND reported_booking_id = p_booking_id)
    )
    AND created_at > now() - INTERVAL '24 hours'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already reported this recently', 'existing_report_id', v_existing);
  END IF;

  -- Create report
  INSERT INTO reports (
    reporter_id, report_type, reason,
    reported_listing_id, reported_user_id, reported_booking_id,
    metadata
  ) VALUES (
    p_reporter_id, p_report_type, p_reason,
    p_listing_id, p_user_id, p_booking_id,
    p_metadata
  ) RETURNING id INTO v_report_id;

  -- Auto-flag content if severe
  IF p_report_type IN ('fraud', 'harassment', 'fake_listing', 'unsafe_property') THEN
    IF p_listing_id IS NOT NULL THEN
      INSERT INTO content_flags (content_type, content_id, flag_type, reason, severity)
      VALUES ('listing', p_listing_id, 'user_reported', p_reason, 'high');
    END IF;
    IF p_user_id IS NOT NULL THEN
      INSERT INTO content_flags (content_type, content_id, flag_type, reason, severity)
      VALUES ('profile', p_user_id, 'user_reported', p_reason, 'high');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'report_id', v_report_id);
END;
$$;

-- === 9. TRIGGER for reports updated_at ===
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_updated_at ON reports;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_reports_updated_at();

COMMIT;
