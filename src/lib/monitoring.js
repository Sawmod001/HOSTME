import { supabase } from "@/lib/db/supabase";

/**
 * Lightweight monitoring utilities for ClockHost.
 * All functions are non-blocking (fire-and-forget) to avoid impacting request latency.
 */

/**
 * Record a request metric (non-blocking).
 */
export function recordRequest({ endpoint, method, statusCode, responseTimeMs, userId }) {
  supabase
    .rpc("record_request_metric", {
      p_endpoint: endpoint,
      p_method: method,
      p_status_code: statusCode,
      p_response_time_ms: responseTimeMs || null,
      p_user_id: userId || null,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to record request metric:", error.message);
    })
    .catch(() => {});
}

/**
 * Log an error (non-blocking).
 */
export function logError({ source, level = "error", message, stack, userId, metadata }) {
  supabase
    .rpc("log_error", {
      p_source: source,
      p_level: level,
      p_message: message,
      p_stack: stack || null,
      p_user_id: userId || null,
      p_metadata: metadata || null,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to log error:", error.message);
    })
    .catch(() => {});
}

/**
 * Record a health check (non-blocking).
 */
export function recordHealthCheck({ service, status, responseTimeMs, metadata }) {
  supabase
    .rpc("record_health_check", {
      p_service: service,
      p_status: status,
      p_response_time_ms: responseTimeMs || null,
      p_metadata: metadata || null,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to record health check:", error.message);
    })
    .catch(() => {});
}

/**
 * Record an uptime check (non-blocking).
 */
export function recordUptimeCheck({ endpoint, method, expectedStatus, actualStatus, responseTimeMs }) {
  supabase
    .rpc("record_uptime_check", {
      p_endpoint: endpoint,
      p_method: method,
      p_expected_status: expectedStatus,
      p_actual_status: actualStatus,
      p_response_time_ms: responseTimeMs,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to record uptime check:", error.message);
    })
    .catch(() => {});
}

/**
 * Middleware: record request metrics for an API route.
 * Usage in route handlers:
 *   const timer = startTimer(request);
 *   // ... handle request ...
 *   timer.end(statusCode);
 */
export function startTimer(request) {
  const start = Date.now();
  const url = new URL(request.url);

  return {
    end(statusCode, userId) {
      const responseTimeMs = Date.now() - start;
      recordRequest({
        endpoint: url.pathname,
        method: request.method,
        statusCode,
        responseTimeMs,
        userId,
      });
    },
  };
}

/**
 * Check if a service is healthy (for health check endpoints).
 */
export async function checkServiceHealth(service, checkFn) {
  const start = Date.now();
  try {
    const result = await checkFn();
    const responseTimeMs = Date.now() - start;
    const status = responseTimeMs > 5000 ? "degraded" : "healthy";

    recordHealthCheck({
      service,
      status,
      responseTimeMs,
      metadata: result,
    });

    return { status, responseTimeMs, ...result };
  } catch (error) {
    const responseTimeMs = Date.now() - start;
    recordHealthCheck({
      service,
      status: "down",
      responseTimeMs,
      metadata: { error: error.message },
    });

    return { status: "down", responseTimeMs, error: error.message };
  }
}
