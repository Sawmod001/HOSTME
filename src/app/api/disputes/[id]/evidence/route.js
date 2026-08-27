import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { ok, fail } from "@/lib/db/supabase-utils";
import { validateCsrfOrigin } from "@/lib/csrf";

/**
 * POST /api/disputes/[id]/evidence
 * Submit evidence for a dispute.
 *
 * Body:
 *   { evidenceType, fileUrl?, description? }
 */
export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const { id } = await params;
    const body = await request.json();
    const { evidenceType, fileUrl, description } = body;

    if (!evidenceType) return fail("evidenceType required", 400);

    const validTypes = ["photo", "video", "document", "message_screenshot", "other"];
    if (!validTypes.includes(evidenceType)) {
      return fail(`evidenceType must be one of: ${validTypes.join(", ")}`, 400);
    }

    // Verify dispute exists and user is participant
    const { data: dispute } = await supabase
      .from("disputes")
      .select("id, filed_by, against_user_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!dispute) return fail("Dispute not found", 404);

    const isAdmin = user.role === "admin";
    const isFilier = dispute.filed_by === user.id;
    const isAgainst = dispute.against_user_id === user.id;

    if (!isAdmin && !isFilier && !isAgainst) {
      return fail("Not authorized", 403);
    }

    if (!["open", "under_review", "awaiting_response"].includes(dispute.status)) {
      return fail("Dispute is not accepting evidence", 409);
    }

    const { data: evidence, error } = await supabase
      .from("dispute_evidence")
      .insert({
        dispute_id: id,
        submitted_by: user.id,
        evidence_type: evidenceType,
        file_url: fileUrl || null,
        description: description || null,
      })
      .select()
      .single();

    if (error) throw error;

    return ok({ ok: true, data: { evidenceId: evidence.id } }, 201);
  } catch (error) {
    console.error("POST /api/disputes/[id]/evidence error:", error);
    return fail("Failed to submit evidence", 500);
  }
}
