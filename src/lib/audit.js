/**
 * ClockHost Enhanced Audit Library
 * Compliance logging, risk assessment, data retention management.
 */

import { supabase } from "@/lib/db/supabase";

/**
 * Risk levels for audit events.
 */
export const RISK_LEVELS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

/**
 * Compliance tags for audit events.
 */
export const COMPLIANCE_TAGS = {
  FINANCIAL: "financial",
  PII: "pii",
  AUTH: "auth",
  DATA_ACCESS: "data_access",
  ADMIN: "admin",
};

/**
 * Enhanced audit logging with automatic risk assessment.
 */
export async function logEnhancedAudit({
  actorId,
  action,
  resourceType,
  resourceId = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
  requestId = null,
  sessionId = null,
}) {
  try {
    const { data, error } = await supabase.rpc("log_enhanced_audit", {
      p_actor_id: actorId,
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_metadata: metadata,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_request_id: requestId,
      p_session_id: sessionId,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("[Audit] Failed to log enhanced audit:", error.message);
    return null;
  }
}

/**
 * Get audit trail for a specific resource.
 */
export async function getResourceAuditTrail(resourceType, resourceId, limit = 50) {
  const { data, error } = await supabase.rpc("get_resource_audit_trail", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_limit: limit,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Get compliance report for a time period.
 */
export async function getComplianceReport(days = 30, tag = null) {
  const { data, error } = await supabase.rpc("get_compliance_report", {
    p_days: days,
    p_tag: tag,
  });

  if (error) throw error;
  return data;
}

/**
 * Extract request metadata for audit logging.
 */
export function extractRequestMeta(request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
    requestId: request.headers.get("x-request-id") || null,
  };
}

/**
 * Audit middleware for API routes.
 * Wraps a handler with automatic audit logging.
 *
 * Usage:
 *   export const POST = withAudit(async (request) => {
 *     // ... handler logic
 *   }, { action: "listing.create", resourceType: "listing" });
 */
export function withAudit(handler, options = {}) {
  return async (request, context) => {
    const start = Date.now();
    const meta = extractRequestMeta(request);

    try {
      const response = await handler(request, context);

      // Log successful action
      if (options.action) {
        logEnhancedAudit({
          actorId: options.getActorId?.(request, context) || null,
          action: options.action,
          resourceType: options.resourceType,
          resourceId: options.getResourceId?.(request, context) || null,
          metadata: {
            ...options.metadata,
            method: request.method,
            url: request.url,
            status: response.status,
            duration_ms: Date.now() - start,
          },
          ...meta,
        });
      }

      return response;
    } catch (error) {
      // Log failed action
      if (options.action) {
        logEnhancedAudit({
          actorId: options.getActorId?.(request, context) || null,
          action: options.action + ".failed",
          resourceType: options.resourceType,
          resourceId: options.getResourceId?.(request, context) || null,
          metadata: {
            ...options.metadata,
            method: request.method,
            url: request.url,
            error: error.message,
            duration_ms: Date.now() - start,
          },
          ...meta,
        });
      }

      throw error;
    }
  };
}

/**
 * Data retention manager.
 */
export const dataRetention = {
  /**
   * Run the data retention cleanup process.
   */
  async cleanup() {
    const { data, error } = await supabase.rpc("archive_old_data");
    if (error) throw error;
    return data;
  },

  /**
   * Cleanup expired archive entries.
   */
  async cleanupArchives() {
    const { data, error } = await supabase.rpc("cleanup_expired_archives");
    if (error) throw error;
    return data;
  },

  /**
   * Get retention policies.
   */
  async getPolicies() {
    const { data, error } = await supabase
      .from("data_retention_policies")
      .select("*")
      .order("table_name");

    if (error) throw error;
    return data;
  },

  /**
   * Update a retention policy.
   */
  async updatePolicy(id, updates) {
    const { error } = await supabase
      .from("data_retention_policies")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
  },
};

/**
 * Compliance event types.
 */
export const COMPLIANCE_EVENTS = {
  // Financial events
  PAYMENT_RECEIVED: { action: "payment.received", risk: "high", tags: ["financial"] },
  PAYMENT_RELEASED: { action: "payment.released", risk: "high", tags: ["financial"] },
  PAYMENT_REFUNDED: { action: "payment.refunded", risk: "high", tags: ["financial"] },

  // Auth events
  USER_LOGIN: { action: "user.login", risk: "low", tags: ["auth"] },
  USER_LOGOUT: { action: "user.logout", risk: "low", tags: ["auth"] },
  PASSWORD_CHANGED: { action: "user.password_changed", risk: "medium", tags: ["auth"] },
  ROLE_CHANGED: { action: "user.role_changed", risk: "high", tags: ["auth", "admin"] },

  // Data events
  PROFILE_UPDATED: { action: "profile.updated", risk: "medium", tags: ["pii"] },
  ACCOUNT_DELETED: { action: "account.deleted", risk: "high", tags: ["pii"] },
  DATA_EXPORTED: { action: "data.exported", risk: "medium", tags: ["pii"] },

  // Booking events
  BOOKING_CREATED: { action: "booking.created", risk: "medium", tags: [] },
  BOOKING_CANCELLED: { action: "booking.cancelled", risk: "medium", tags: [] },
  BOOKING_COMPLETED: { action: "booking.completed", risk: "low", tags: [] },

  // Admin events
  USER_SUSPENDED: { action: "admin.user_suspended", risk: "critical", tags: ["admin"] },
  LISTING_SUSPENDED: { action: "admin.listing_suspended", risk: "high", tags: ["admin"] },
  DISPUTE_RESOLVED: { action: "admin.dispute_resolved", risk: "high", tags: ["admin"] },
};
