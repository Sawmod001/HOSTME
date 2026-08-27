-- Migration: Batch 30 — Final Polish
-- Deployment verification, cleanup functions, summary views

BEGIN;

-- === 1. DEPLOYMENT VERIFICATION FUNCTION ===
CREATE OR REPLACE FUNCTION verify_deployment()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSONB;
  v_tables INTEGER;
  v_functions INTEGER;
  v_indexes INTEGER;
  v_policies INTEGER;
BEGIN
  -- Count tables
  SELECT count(*) INTO v_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  -- Count functions
  SELECT count(*) INTO v_functions
  FROM information_schema.routines
  WHERE routine_schema = 'public';

  -- Count indexes
  SELECT count(*) INTO v_indexes
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname NOT LIKE 'idx_%_pkey';

  -- Count RLS policies
  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public';

  v_result := jsonb_build_object(
    'status', 'deployed',
    'version', '30',
    'timestamp', now(),
    'stats', jsonb_build_object(
      'tables', v_tables,
      'functions', v_functions,
      'indexes', v_indexes,
      'rls_policies', v_policies
    ),
    'features', jsonb_build_array(
      'auth', 'listings', 'bookings', 'payments', 'search',
      'reviews', 'calendar', 'documents', 'notifications',
      'messaging', 'disputes', 'admin', 'analytics',
      'webhooks', 'api_keys', 'monitoring', 'caching',
      'security', 'audit'
    )
  );

  RETURN v_result;
END;
$$;

-- === 2. DATABASE SCHEMA SUMMARY VIEW ===
CREATE OR REPLACE VIEW db_schema_summary AS
SELECT
  t.table_name,
  (
    SELECT count(*)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = t.table_name
  ) AS column_count,
  (
    SELECT count(*)
    FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename = t.table_name
  ) AS index_count,
  (
    SELECT count(*)
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.table_name
  ) AS policy_count
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- === 3. FUNCTION CATALOG VIEW ===
CREATE OR REPLACE VIEW db_function_catalog AS
SELECT
  r.routine_name AS function_name,
  r.routine_type,
  r.data_type AS return_type,
  (
    SELECT count(*)
    FROM information_schema.parameters p
    WHERE p.specific_name = r.specific_name
  ) AS parameter_count
FROM information_schema.routines r
WHERE r.routine_schema = 'public'
ORDER BY r.routine_name;

-- === 4. CLEANUP: Remove orphaned data ===
CREATE OR REPLACE FUNCTION cleanup_orphaned_data()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_results JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  -- Cleanup booking snapshot audit for deleted bookings
  DELETE FROM booking_snapshot_audit
  WHERE booking_id NOT IN (SELECT id FROM bookings);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('orphaned_snapshots', v_count);

  -- Cleanup escrow releases for deleted bookings
  DELETE FROM escrow_releases
  WHERE booking_id NOT IN (SELECT id FROM bookings);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('orphaned_escrows', v_count);

  -- Cleanup documents for deleted bookings
  DELETE FROM documents
  WHERE booking_id IS NOT NULL
    AND booking_id NOT IN (SELECT id FROM bookings);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('orphaned_documents', v_count);

  -- Cleanup messages for deleted conversations
  DELETE FROM messages
  WHERE conversation_id NOT IN (SELECT id FROM conversations);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('orphaned_messages', v_count);

  -- Cleanup dispute evidence for deleted disputes
  DELETE FROM dispute_evidence
  WHERE dispute_id NOT IN (SELECT id FROM disputes);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_results := v_results || jsonb_build_object('orphaned_evidence', v_count);

  RETURN v_results;
END;
$$;

-- === 5. HEALTH CHECK FUNCTION ===
CREATE OR REPLACE FUNCTION database_health_check()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSONB;
  v_db_size BIGINT;
  v_active_connections INTEGER;
  v_table_count INTEGER;
BEGIN
  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size;

  -- Active connections
  SELECT count(*) INTO v_active_connections
  FROM pg_stat_activity
  WHERE state = 'active';

  -- Table count
  SELECT count(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  v_result := jsonb_build_object(
    'status', 'healthy',
    'database_size_bytes', v_db_size,
    'database_size_mb', round(v_db_size / 1048576.0, 2),
    'active_connections', v_active_connections,
    'table_count', v_table_count,
    'checked_at', now()
  );

  RETURN v_result;
END;
$$;

-- === 6. INSERT DEFAULT HOST SETTINGS for existing hosts ===
INSERT INTO host_settings (user_id, auto_approve_bookings, cancellation_policy, payout_method)
SELECT id, false, 'moderate', 'bank_transfer'
FROM users
WHERE role = 'host'
  AND id NOT IN (SELECT user_id FROM host_settings)
ON CONFLICT DO NOTHING;

-- === 7. CREATE DEFAULT NOTIFICATION PREFERENCES for all users ===
INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, sms_enabled, booking_updates, message_updates, promotion_updates)
SELECT id, true, true, false, true, true, false
FROM users
WHERE id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT DO NOTHING;

COMMIT;
