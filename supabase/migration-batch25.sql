-- Migration: Batch 25 — Webhooks
-- Outbound event delivery, retry queue, HMAC signatures, admin management

BEGIN;

-- === 1. CREATE webhook_endpoints TABLE ===
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['*'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT webhook_events_not_empty CHECK (array_length(events, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user ON webhook_endpoints (user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints (is_active) WHERE is_active = true;

-- === 2. CREATE webhook_events TABLE (outbox) ===
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events (created_at);

-- === 3. CREATE webhook_deliveries TABLE ===
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries (event_id);

-- === 4. RLS POLICIES ===
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Webhook endpoints: owner can manage
CREATE POLICY webhook_endpoints_own ON webhook_endpoints
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Webhook events: system can insert, admin can read
CREATE POLICY webhook_events_insert ON webhook_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY webhook_events_admin_read ON webhook_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Webhook deliveries: owner can read their endpoint's deliveries
CREATE POLICY webhook_deliveries_own_read ON webhook_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM webhook_endpoints we
      WHERE we.id = webhook_deliveries.endpoint_id
        AND we.user_id = auth.uid()
    )
  );

-- System can insert/update deliveries
CREATE POLICY webhook_deliveries_system_insert ON webhook_deliveries
  FOR INSERT WITH CHECK (true);

CREATE POLICY webhook_deliveries_system_update ON webhook_deliveries
  FOR UPDATE USING (true);

-- === 5. WEBHOOK FUNCTIONS ===

-- Register a webhook endpoint
CREATE OR REPLACE FUNCTION register_webhook(
  p_user_id UUID,
  p_url TEXT,
  p_secret TEXT,
  p_events TEXT[] DEFAULT ARRAY['*'],
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_count INTEGER;
BEGIN
  -- Validate URL
  IF p_url !~ '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'URL must start with http:// or https://');
  END IF;

  -- Max 10 webhooks per user
  SELECT count(*) INTO v_count FROM webhook_endpoints WHERE user_id = p_user_id;
  IF v_count >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Maximum 10 webhook endpoints per user');
  END IF;

  INSERT INTO webhook_endpoints (user_id, url, secret, events, description)
  VALUES (p_user_id, p_url, p_secret, p_events, p_description)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'endpoint_id', v_id);
END;
$$;

-- Emit a webhook event
CREATE OR REPLACE FUNCTION emit_webhook_event(
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}',
  p_source TEXT DEFAULT 'system'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id UUID;
  v_endpoint RECORD;
  v_delivery_id UUID;
BEGIN
  -- Insert the event
  INSERT INTO webhook_events (event_type, payload, source)
  VALUES (p_event_type, p_payload, p_source)
  RETURNING id INTO v_event_id;

  -- Create deliveries for all matching active endpoints
  FOR v_endpoint IN
    SELECT id, events FROM webhook_endpoints
    WHERE is_active = true
      AND (events = ARRAY['*'] OR p_event_type = ANY(events))
  LOOP
    INSERT INTO webhook_deliveries (endpoint_id, event_id, status, next_retry_at)
    VALUES (v_endpoint.id, v_event_id, 'pending', now());
  END LOOP;

  RETURN v_event_id;
END;
$$;

-- Process pending webhook deliveries (call from cron/edge function)
CREATE OR REPLACE FUNCTION process_webhook_deliveries(p_batch_size INTEGER DEFAULT 10)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_delivery RECORD;
  v_processed INTEGER := 0;
BEGIN
  FOR v_delivery IN
    SELECT d.id, d.endpoint_id, d.event_id, d.attempt, d.max_attempts,
           we.url, we.secret, we.failure_count,
           we.id as ep_id
    FROM webhook_deliveries d
    JOIN webhook_endpoints we ON we.id = d.endpoint_id
    WHERE d.status IN ('pending', 'retrying')
      AND (d.next_retry_at IS NULL OR d.next_retry_at <= now())
      AND we.is_active = true
      AND we.failure_count < 20
    ORDER BY d.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF d SKIP LOCKED
  LOOP
    -- Mark as processing (system will deliver via HTTP)
    UPDATE webhook_deliveries
    SET status = 'retrying', attempt = attempt + 1
    WHERE id = v_delivery.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

-- Record delivery result
CREATE OR REPLACE FUNCTION record_webhook_delivery(
  p_delivery_id UUID,
  p_status TEXT,
  p_response_status INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_retry TIMESTAMPTZ;
  v_endpoint_id UUID;
  v_attempt INTEGER;
  v_max_attempts INTEGER;
BEGIN
  SELECT endpoint_id, attempt, max_attempts
  INTO v_endpoint_id, v_attempt, v_max_attempts
  FROM webhook_deliveries WHERE id = p_delivery_id;

  IF p_status = 'success' THEN
    UPDATE webhook_deliveries
    SET status = 'success', response_status = p_response_status,
        response_body = p_response_body, delivered_at = now()
    WHERE id = p_delivery_id;

    UPDATE webhook_endpoints SET failure_count = 0, last_triggered_at = now()
    WHERE id = v_endpoint_id;
  ELSIF v_attempt >= v_max_attempts THEN
    UPDATE webhook_deliveries
    SET status = 'failed', response_status = p_response_status,
        response_body = p_response_body, error_message = p_error_message
    WHERE id = p_delivery_id;

    UPDATE webhook_endpoints
    SET failure_count = failure_count + 1
    WHERE id = v_endpoint_id;

    -- Auto-disable after 20 consecutive failures
    UPDATE webhook_endpoints
    SET is_active = false
    WHERE id = v_endpoint_id AND failure_count >= 20;
  ELSE
    -- Exponential backoff: 30s, 2m, 8m, 30m, 2h
    v_next_retry := now() + (
      CASE v_attempt
        WHEN 1 THEN INTERVAL '30 seconds'
        WHEN 2 THEN INTERVAL '2 minutes'
        WHEN 3 THEN INTERVAL '8 minutes'
        WHEN 4 THEN INTERVAL '30 minutes'
        ELSE INTERVAL '2 hours'
      END
    );

    UPDATE webhook_deliveries
    SET status = 'retrying', response_status = p_response_status,
        error_message = p_error_message, next_retry_at = v_next_retry
    WHERE id = p_delivery_id;
  END IF;
END;
$$;

-- Get webhook delivery stats for an endpoint
CREATE OR REPLACE FUNCTION get_webhook_delivery_stats(p_endpoint_id UUID, p_days INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'success', count(*) FILTER (WHERE status = 'success'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'retrying', count(*) FILTER (WHERE status = 'retrying'),
      'success_rate', round(
        count(*) FILTER (WHERE status = 'success')::numeric /
        NULLIF(count(*), 0) * 100, 1
      )
    )
    FROM webhook_deliveries
    WHERE endpoint_id = p_endpoint_id
      AND created_at > now() - (p_days || ' days')::interval
  );
END;
$$;

-- Generate HMAC signature for webhook payload
CREATE OR REPLACE FUNCTION generate_webhook_signature(
  p_secret TEXT,
  p_payload JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(
    hmac(p_payload::text::bytea, p_secret::bytea, 'sha256'),
    'hex'
  );
END;
$$;

-- Cleanup old webhook data (>30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_data()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM webhook_deliveries WHERE created_at < now() - INTERVAL '30 days';
  DELETE FROM webhook_events WHERE created_at < now() - INTERVAL '30 days';
END;
$$;

COMMIT;
