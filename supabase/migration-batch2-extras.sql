-- =============================================================================
-- ClockHost Migration — Batch 2 additions: WhatsApp sessions + indexes
-- =============================================================================
-- Add to migration-batch2.sql or run separately
-- =============================================================================

BEGIN;

-- =============================================================================
-- WHATSAPP SESSIONS: Persistent session storage (replaces in-memory Map)
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expires ON whatsapp_sessions(last_active_at);

-- Auto-cleanup stale sessions (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_whatsapp_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_sessions WHERE last_active_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- AUDIT LOGGING: Add log entries for booking/payment state changes
-- (These are application-level — the DB trigger handles status transitions)
-- =============================================================================

-- Index for faster audit queries on bookings
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_action ON audit_logs(actor_id, action);

COMMIT;
