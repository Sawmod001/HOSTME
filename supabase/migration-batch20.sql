-- Migration: Batch 20 — Settings
-- User profile, host settings, account management

BEGIN;

-- === 1. ADD PROFILE COLUMNS TO users ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT CHECK (bio IS NULL OR length(bio) <= 1000);
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Africa/Lagos';
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en' CHECK (language IN ('en', 'ha', 'yo', 'ig', 'pcm'));

-- === 2. CREATE host_settings TABLE ===
CREATE TABLE IF NOT EXISTS host_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  auto_approve_bookings BOOLEAN NOT NULL DEFAULT false,
  instant_booking BOOLEAN NOT NULL DEFAULT false,
  min_notice_hours INTEGER NOT NULL DEFAULT 24 CHECK (min_notice_hours >= 0),
  max_advance_days INTEGER NOT NULL DEFAULT 365 CHECK (max_advance_days >= 1),
  response_time_hours INTEGER DEFAULT 24,
  cancellation_window_hours INTEGER NOT NULL DEFAULT 24,
  default_cancellation_policy TEXT NOT NULL DEFAULT 'moderate'
    CHECK (default_cancellation_policy IN ('flexible', 'moderate', 'strict', 'non_refundable')),
  payout_method TEXT DEFAULT 'bank_transfer',
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_host_settings_user ON host_settings (user_id);

-- === 3. RLS FOR host_settings ===
ALTER TABLE host_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY host_settings_own ON host_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- === 4. CREATE account_deletion_requests TABLE ===
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON account_deletion_requests (user_id);

-- === 5. RLS FOR account_deletion_requests ===
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY deletion_requests_own ON account_deletion_requests
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- === 6. TRIGGER for host_settings updated_at ===
CREATE OR REPLACE FUNCTION update_host_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS host_settings_updated_at ON host_settings;
CREATE TRIGGER host_settings_updated_at
  BEFORE UPDATE ON host_settings
  FOR EACH ROW EXECUTE FUNCTION update_host_settings_updated_at();

-- === 7. AUTO-CREATE host_settings ON PROVIDER CREATION ===
CREATE OR REPLACE FUNCTION auto_create_host_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_type IN ('venue_host', 'housing_agent') THEN
    INSERT INTO host_settings (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_host_settings_trigger ON provider_profiles;
CREATE TRIGGER auto_host_settings_trigger
  AFTER INSERT ON provider_profiles
  FOR EACH ROW EXECUTE FUNCTION auto_create_host_settings();

COMMIT;
