import { supabase } from "./supabase.js";

/**
 * Write an entry to audit_logs. Non-blocking — failures are logged but never
 * throw, so audit logging never breaks the calling flow.
 *
 * @param {object} params
 * @param {string} params.actorId    - UUID of the user performing the action
 * @param {string} params.action     - e.g. 'role.changed', 'provider_profile.created'
 * @param {string} params.resourceType - e.g. 'user', 'provider_profile', 'listing'
 * @param {string} [params.resourceId] - UUID of the affected resource
 * @param {object} [params.metadata]  - arbitrary JSONB payload
 */
export async function logAudit({ actorId, action, resourceType, resourceId, metadata }) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: actorId || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      metadata: metadata || {},
    });
    if (error) console.error("[audit] write failed:", error.message);
  } catch (err) {
    console.error("[audit] write failed:", err.message);
  }
}
