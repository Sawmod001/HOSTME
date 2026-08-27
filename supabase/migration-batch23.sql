-- Migration: Batch 23 — API Keys
-- Host API access, key management, usage tracking

BEGIN;

-- === 1. CREATE api_keys TABLE ===
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,

  CONSTRAINT api_keys_scopes_check CHECK (
    scopes <@ ARRAY['read', 'write', 'bookings', 'listings', 'calendar', 'analytics']
  )
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);

-- === 2. CREATE api_usage TABLE ===
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage (api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage (created_at);

-- === 3. RLS POLICIES ===
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- API keys: owner can manage
CREATE POLICY api_keys_own ON api_keys
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- API usage: owner can read their keys' usage
CREATE POLICY api_usage_own_read ON api_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM api_keys ak
      WHERE ak.id = api_usage.api_key_id
        AND ak.user_id = auth.uid()
    )
  );

-- === 4. HELPER FUNCTIONS ===

-- Generate a new API key
CREATE OR REPLACE FUNCTION generate_api_key(
  p_user_id UUID,
  p_name TEXT,
  p_scopes TEXT[] DEFAULT ARRAY['read'],
  p_rate_limit INTEGER DEFAULT 60,
  p_expires_days INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw_key TEXT;
  v_key_hash TEXT;
  v_key_prefix TEXT;
  v_key_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate random key
  v_raw_key := 'chk_' || encode(gen_random_bytes(32), 'hex');
  v_key_hash := encode(sha256(v_raw_key::bytea), 'hex');
  v_key_prefix := LEFT(v_raw_key, 12) || '...';

  -- Set expiry
  IF p_expires_days IS NOT NULL THEN
    v_expires_at := now() + (p_expires_days || ' days')::interval;
  END IF;

  INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, rate_limit_per_minute, expires_at)
  VALUES (p_user_id, p_name, v_key_hash, v_key_prefix, p_scopes, p_rate_limit, v_expires_at)
  RETURNING id INTO v_key_id;

  RETURN jsonb_build_object(
    'ok', true,
    'key_id', v_key_id,
    'raw_key', v_raw_key,
    'key_prefix', v_key_prefix,
    'scopes', p_scopes,
    'expires_at', v_expires_at
  );
END;
$$;

-- Validate an API key
CREATE OR REPLACE FUNCTION validate_api_key(p_raw_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_key RECORD;
  v_hash TEXT;
BEGIN
  v_hash := encode(sha256(p_raw_key::bytea), 'hex');

  SELECT id, user_id, name, scopes, rate_limit_per_minute, is_active, expires_at
  INTO v_key
  FROM api_keys
  WHERE key_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid API key');
  END IF;

  IF NOT v_key.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'API key is revoked');
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'API key has expired');
  END IF;

  -- Update last used
  UPDATE api_keys SET last_used_at = now() WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'valid', true,
    'key_id', v_key.id,
    'user_id', v_key.user_id,
    'name', v_key.name,
    'scopes', v_key.scopes,
    'rate_limit', v_key.rate_limit_per_minute
  );
END;
$$;

-- Log API usage
CREATE OR REPLACE FUNCTION log_api_usage(
  p_api_key_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO api_usage (api_key_id, endpoint, method, status_code, response_time_ms)
  VALUES (p_api_key_id, p_endpoint, p_method, p_status_code, p_response_time_ms);
END;
$$;

-- Get API key usage stats
CREATE OR REPLACE FUNCTION get_api_key_stats(
  p_api_key_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_requests', count(*),
    'avg_response_time', round(avg(response_time_ms)),
    'error_count', count(*) FILTER (WHERE status_code >= 400),
    'endpoints', (
      SELECT jsonb_agg(
        jsonb_build_object('endpoint', endpoint, 'count', cnt)
        ORDER BY cnt DESC
      )
      FROM (
        SELECT endpoint, count(*) as cnt
        FROM api_usage
        WHERE api_key_id = p_api_key_id
          AND created_at > now() - (p_days || ' days')::interval
        GROUP BY endpoint
        LIMIT 10
      ) top_endpoints
    )
  ) INTO v_stats
  FROM api_usage
  WHERE api_key_id = p_api_key_id
    AND created_at > now() - (p_days || ' days')::interval;

  RETURN v_stats;
END;
$$;

-- === 5. CLEANUP: Auto-delete old usage data (>90 days) ===
CREATE OR REPLACE FUNCTION cleanup_old_api_usage()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM api_usage
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

COMMIT;
