-- Migration: Batch 29 — Enhanced Audit Trail
-- Compliance logging, data retention, audit analytics

BEGIN;

-- === 1. ENHANCE audit_log TABLE ===
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS compliance_tags TEXT[] DEFAULT '{}';

-- Indexes for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_log_risk ON audit_log (risk_level) WHERE risk_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_compliance ON audit_log USING GIN (compliance_tags);
CREATE INDEX IF NOT EXISTS idx_audit_log_session ON audit_log (session_id) WHERE session_id IS NOT NULL;

-- === 2. CREATE data_retention_policy TABLE ===
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL,
  archive_after_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default retention policies
INSERT INTO data_retention_policies (table_name, retention_days, archive_after_days) VALUES
  ('audit_log', 2555, 365),           -- 7 years, archive after 1 year
  ('error_logs', 365, 90),             -- 1 year, archive after 90 days
  ('request_metrics', 90, 30),         -- 90 days, archive after 30 days
  ('api_usage', 90, 30),               -- 90 days, archive after 30 days
  ('webhook_deliveries', 90, 30),      -- 90 days, archive after 30 days
  ('search_analytics', 90, 30),        -- 90 days, archive after 30 days
  ('listing_views', 365, 90),          -- 1 year, archive after 90 days
  ('system_health', 90, 30)            -- 90 days, archive after 30 days
ON CONFLICT (table_name) DO NOTHING;

-- === 3. CREATE audit_archive TABLE ===
CREATE TABLE IF NOT EXISTS audit_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_table TEXT NOT NULL,
  original_id UUID NOT NULL,
  data JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_days INTEGER NOT NULL,
  delete_after TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_archive_table ON audit_archive (original_table, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_archive_delete ON audit_archive (delete_after);

-- === 4. RLS POLICIES ===
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_retention_admin ON data_retention_policies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY audit_archive_admin ON audit_archive
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 5. AUDIT ENHANCEMENT FUNCTIONS ===

-- Enhanced audit logging with risk assessment
CREATE OR REPLACE FUNCTION log_enhanced_audit(
  p_actor_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_risk_level TEXT;
  v_compliance_tags TEXT[];
BEGIN
  -- Assess risk level
  v_risk_level := CASE
    WHEN p_action LIKE '%delete%' OR p_action LIKE '%remove%' THEN 'high'
    WHEN p_action LIKE '%role%' OR p_action LIKE '%permission%' THEN 'high'
    WHEN p_action LIKE '%payment%' OR p_action LIKE '%refund%' THEN 'high'
    WHEN p_action LIKE '%create%' OR p_action LIKE '%register%' THEN 'medium'
    WHEN p_action LIKE '%update%' OR p_action LIKE '%edit%' THEN 'medium'
    ELSE 'low'
  END;

  -- Determine compliance tags
  v_compliance_tags := ARRAY[]::TEXT[];
  IF p_action LIKE '%payment%' OR p_action LIKE '%refund%' THEN
    v_compliance_tags := array_append(v_compliance_tags, 'financial');
  END IF;
  IF p_resource_type = 'user' OR p_resource_type = 'booking' THEN
    v_compliance_tags := array_append(v_compliance_tags, 'pii');
  END IF;
  IF p_action LIKE '%login%' OR p_action LIKE '%auth%' THEN
    v_compliance_tags := array_append(v_compliance_tags, 'auth');
  END IF;

  INSERT INTO audit_log (
    actor_id, action, resource_type, resource_id, metadata,
    ip_address, user_agent, request_id, session_id,
    risk_level, compliance_tags
  )
  VALUES (
    p_actor_id, p_action, p_resource_type, p_resource_id, p_metadata,
    p_ip_address, p_user_agent, p_request_id, p_session_id,
    v_risk_level, v_compliance_tags
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Get audit trail for a resource
CREATE OR REPLACE FUNCTION get_resource_audit_trail(
  p_resource_type TEXT,
  p_resource_id UUID,
  p_limit INTEGER DEFAULT 50
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
        'actor_id', actor_id,
        'action', action,
        'metadata', metadata,
        'risk_level', risk_level,
        'ip_address', ip_address::text,
        'created_at', created_at
      )
      ORDER BY created_at DESC
    )
    FROM (
      SELECT * FROM audit_log
      WHERE resource_type = p_resource_type
        AND resource_id = p_resource_id
      ORDER BY created_at DESC
      LIMIT p_limit
    ) trail
  );
END;
$$;

-- Get compliance report
CREATE OR REPLACE FUNCTION get_compliance_report(
  p_days INTEGER DEFAULT 30,
  p_tag TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_events', count(*),
      'by_risk_level', (
        SELECT jsonb_object_agg(risk_level, cnt)
        FROM (
          SELECT risk_level, count(*) as cnt
          FROM audit_log
          WHERE created_at > now() - (p_days || ' days')::interval
            AND risk_level IS NOT NULL
          GROUP BY risk_level
        ) rc
      ),
      'by_action', (
        SELECT jsonb_object_agg(action, cnt)
        FROM (
          SELECT action, count(*) as cnt
          FROM audit_log
          WHERE created_at > now() - (p_days || ' days')::interval
          GROUP BY action
          ORDER BY cnt DESC
          LIMIT 20
        ) ac
      ),
      'high_risk_events', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'actor_id', actor_id,
            'action', action,
            'resource_type', resource_type,
            'risk_level', risk_level,
            'created_at', created_at
          )
        )
        FROM audit_log
        WHERE risk_level IN ('high', 'critical')
          AND created_at > now() - (p_days || ' days')::interval
        ORDER BY created_at DESC
        LIMIT 20
      )
    )
    FROM audit_log
    WHERE created_at > now() - (p_days || ' days')::interval
      AND (p_tag IS NULL OR p_tag = ANY(compliance_tags))
  );
END;
$$;

-- === 6. DATA RETENTION FUNCTIONS ===

-- Archive old data based on retention policies
CREATE OR REPLACE FUNCTION archive_old_data()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy RECORD;
  v_archived INTEGER := 0;
  v_results JSONB := '[]'::jsonb;
BEGIN
  FOR v_policy IN
    SELECT * FROM data_retention_policies WHERE is_active = true
  LOOP
    IF v_policy.archive_after_days IS NOT NULL THEN
      -- Archive data older than archive_after_days
      EXECUTE format(
        'INSERT INTO audit_archive (original_table, original_id, data, retention_days, delete_after)
         SELECT %L, id, row_to_json(t), %L, now() + (%L || '' days'')::interval
         FROM %I t
         WHERE created_at < now() - (%L || '' days'')::interval
         ON CONFLICT DO NOTHING',
        v_policy.table_name,
        v_policy.retention_days,
        v_policy.retention_days,
        v_policy.table_name,
        v_policy.archive_after_days
      );

      GET DIAGNOSTICS v_archived = ROW_COUNT;
    END IF;

    -- Delete data older than retention_days
    EXECUTE format(
      'DELETE FROM %I WHERE created_at < now() - (%L || '' days'')::interval',
      v_policy.table_name,
      v_policy.retention_days
    );

    GET DIAGNOSTICS v_archived = ROW_COUNT;

    -- Update last cleanup time
    UPDATE data_retention_policies
    SET last_cleanup_at = now(), updated_at = now()
    WHERE id = v_policy.id;

    v_results := v_results || jsonb_build_object(
      'table', v_policy.table_name,
      'archived', v_archived,
      'retention_days', v_policy.retention_days
    );
  END LOOP;

  RETURN v_results;
END;
$$;

-- Cleanup expired archive entries
CREATE OR REPLACE FUNCTION cleanup_expired_archives()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM audit_archive WHERE delete_after < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- === 7. AUDIT LOG CLEANUP (keep only high-risk events after retention) ===
CREATE OR REPLACE FUNCTION cleanup_audit_log()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete low/medium risk events after 1 year
  DELETE FROM audit_log
  WHERE risk_level IN ('low', 'medium')
    AND created_at < now() - INTERVAL '365 days';

  -- Delete high risk events after 7 years
  DELETE FROM audit_log
  WHERE risk_level IN ('high', 'critical')
    AND created_at < now() - INTERVAL '2555 days';
END;
$$;

COMMIT;
