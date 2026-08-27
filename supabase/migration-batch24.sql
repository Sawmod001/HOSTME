-- Migration: Batch 24 — Monitoring
-- Health checks, error tracking, uptime monitoring, system metrics

BEGIN;

-- === 1. CREATE system_health TABLE ===
CREATE TABLE IF NOT EXISTS system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  response_time_ms INTEGER,
  metadata JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_service ON system_health (service, checked_at DESC);

-- === 2. CREATE error_logs TABLE ===
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  user_id UUID,
  request_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs (user_id) WHERE user_id IS NOT NULL;

-- === 3. CREATE uptime_checks TABLE ===
CREATE TABLE IF NOT EXISTS uptime_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  expected_status INTEGER NOT NULL DEFAULT 200,
  last_status INTEGER,
  last_response_ms INTEGER,
  last_checked_at TIMESTAMPTZ,
  is_up BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uptime_checks_endpoint ON uptime_checks (endpoint);

-- === 4. CREATE request_metrics TABLE (high-volume, partitioned by day) ===
CREATE TABLE IF NOT EXISTS request_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_metrics_created ON request_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_metrics_endpoint ON request_metrics (endpoint, created_at DESC);

-- === 5. RLS POLICIES ===
ALTER TABLE system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uptime_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only access for all monitoring tables
CREATE POLICY system_health_admin ON system_health
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY error_logs_admin ON error_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY uptime_checks_admin ON uptime_checks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY request_metrics_admin ON request_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 6. HEALTH CHECK FUNCTIONS ===

-- Record a health check result
CREATE OR REPLACE FUNCTION record_health_check(
  p_service TEXT,
  p_status TEXT,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO system_health (service, status, response_time_ms, metadata)
  VALUES (p_service, p_status, p_response_time_ms, p_metadata)
  RETURNING id INTO v_id;

  -- Auto-degrade alert: if 3 consecutive downs, flag it
  IF p_status = 'down' THEN
    IF (
      SELECT count(*) FROM system_health
      WHERE service = p_service AND status = 'down'
        AND checked_at > now() - INTERVAL '5 minutes'
    ) >= 3 THEN
      PERFORM log_error(
        'monitoring', 'warn',
        'Service ' || p_service || ' has been down for 3+ consecutive checks',
        NULL, NULL, jsonb_build_object('service', p_service)
      );
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- Get service health summary
CREATE OR REPLACE FUNCTION get_service_health()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'service', service,
        'status', status,
        'response_time_ms', response_time_ms,
        'last_checked', checked_at
      )
    )
    FROM (
      SELECT DISTINCT ON (service)
        service, status, response_time_ms, checked_at
      FROM system_health
      ORDER BY service, checked_at DESC
    ) latest
  );
END;
$$;

-- === 7. ERROR LOGGING FUNCTIONS ===

-- Log an error
CREATE OR REPLACE FUNCTION log_error(
  p_source TEXT,
  p_level TEXT,
  p_message TEXT,
  p_stack TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO error_logs (level, source, message, stack, user_id, metadata)
  VALUES (p_level, p_source, p_message, p_stack, p_user_id, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Get recent errors
CREATE OR REPLACE FUNCTION get_recent_errors(
  p_limit INTEGER DEFAULT 50,
  p_level TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'level', level,
        'source', source,
        'message', message,
        'user_id', user_id,
        'metadata', metadata,
        'created_at', created_at
      )
      ORDER BY created_at DESC
    )
    FROM (
      SELECT * FROM error_logs
      WHERE (p_level IS NULL OR level = p_level)
        AND (p_source IS NULL OR source = p_source)
      ORDER BY created_at DESC
      LIMIT p_limit
    ) recent
  );
END;
$$;

-- Get error summary (counts by source and level)
CREATE OR REPLACE FUNCTION get_error_summary(p_hours INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'by_level', (
        SELECT jsonb_object_agg(level, cnt)
        FROM (
          SELECT level, count(*) as cnt
          FROM error_logs
          WHERE created_at > now() - (p_hours || ' hours')::interval
          GROUP BY level
        ) lc
      ),
      'by_source', (
        SELECT jsonb_object_agg(source, cnt)
        FROM (
          SELECT source, count(*) as cnt
          FROM error_logs
          WHERE created_at > now() - (p_hours || ' hours')::interval
          GROUP BY source
          ORDER BY cnt DESC
          LIMIT 10
        ) sc
      )
    )
    FROM error_logs
    WHERE created_at > now() - (p_hours || ' hours')::interval
  );
END;
$$;

-- === 8. UPTIME CHECK FUNCTIONS ===

-- Record an uptime check
CREATE OR REPLACE FUNCTION record_uptime_check(
  p_endpoint TEXT,
  p_method TEXT,
  p_expected_status INTEGER,
  p_actual_status INTEGER,
  p_response_time_ms INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_is_up BOOLEAN;
BEGIN
  v_is_up := (p_actual_status = p_expected_status);

  INSERT INTO uptime_checks (endpoint, method, expected_status, last_status, last_response_ms, last_checked_at, is_up)
  VALUES (p_endpoint, p_method, p_expected_status, p_actual_status, p_response_time_ms, now(), v_is_up)
  ON CONFLICT (endpoint) DO UPDATE SET
    last_status = p_actual_status,
    last_response_ms = p_response_time_ms,
    last_checked_at = now(),
    is_up = v_is_up;

  RETURN v_id;
END;
$$;

-- Get uptime status
CREATE OR REPLACE FUNCTION get_uptime_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'endpoint', endpoint,
        'method', method,
        'expected_status', expected_status,
        'last_status', last_status,
        'last_response_ms', last_response_ms,
        'last_checked', last_checked_at,
        'is_up', is_up
      )
    )
    FROM uptime_checks
  );
END;
$$;

-- === 9. REQUEST METRICS FUNCTIONS ===

-- Record a request metric
CREATE OR REPLACE FUNCTION record_request_metric(
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO request_metrics (endpoint, method, status_code, response_time_ms, user_id)
  VALUES (p_endpoint, p_method, p_status_code, p_response_time_ms, p_user_id);
END;
$$;

-- Get request metrics summary
CREATE OR REPLACE FUNCTION get_request_metrics_summary(p_hours INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_requests', count(*),
      'avg_response_time', round(avg(response_time_ms)),
      'p95_response_time', (
        SELECT round(response_time_ms)
        FROM request_metrics
        WHERE created_at > now() - (p_hours || ' hours')::interval
          AND response_time_ms IS NOT NULL
        ORDER BY response_time_ms
        LIMIT 1 OFFSET (count(*) * 0.95)::int
      ),
      'error_rate', (
        SELECT round(
          count(*) FILTER (WHERE status_code >= 400)::numeric /
          NULLIF(count(*), 0) * 100, 2
        )
        FROM request_metrics
        WHERE created_at > now() - (p_hours || ' hours')::interval
      ),
      'by_status', (
        SELECT jsonb_object_agg(status_code::text, cnt)
        FROM (
          SELECT status_code, count(*) as cnt
          FROM request_metrics
          WHERE created_at > now() - (p_hours || ' hours')::interval
          GROUP BY status_code
          ORDER BY cnt DESC
        ) sc
      ),
      'top_endpoints', (
        SELECT jsonb_agg(
          jsonb_build_object('endpoint', endpoint, 'count', cnt, 'avg_ms', avg_ms)
          ORDER BY cnt DESC
        )
        FROM (
          SELECT endpoint, count(*) as cnt, round(avg(response_time_ms)) as avg_ms
          FROM request_metrics
          WHERE created_at > now() - (p_hours || ' hours')::interval
          GROUP BY endpoint
          ORDER BY cnt DESC
          LIMIT 10
        ) te
      )
    )
    FROM request_metrics
    WHERE created_at > now() - (p_hours || ' hours')::interval
  );
END;
$$;

-- === 10. CLEANUP: Auto-delete old metrics (>30 days) ===
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM request_metrics WHERE created_at < now() - INTERVAL '30 days';
  DELETE FROM error_logs WHERE created_at < now() - INTERVAL '90 days';
  DELETE FROM system_health WHERE checked_at < now() - INTERVAL '30 days';
END;
$$;

-- === 11. UNIQUE INDEX for uptime_checks endpoint ===
CREATE UNIQUE INDEX IF NOT EXISTS idx_uptime_checks_endpoint_unique ON uptime_checks (endpoint);

COMMIT;
