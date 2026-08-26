import { NextResponse } from "next/server";
import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { findUserByClerkId, findVerificationById, updateVerification, updateProviderProfile, listVerificationsByProviderProfile } from "@/lib/db/supabase-queries";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { z } from "zod";

const RejectSchema = z.object({
  reason: z.string().min(5).max(500),
});

export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await findUserByClerkId(sessionInfo.userId);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const verification = await findVerificationById(id);
    if (!verification) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 });
    }

    if (verification.status !== "pending") {
      return NextResponse.json({ error: "Can only reject pending verifications" }, { status: 409 });
    }

    const body = await request.json();
    const parsed = RejectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Reject the verification
    await updateVerification(id, {
      status: "rejected",
      review_note: parsed.data.reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    });

    // Check if ANY verification for this provider is still approved → if not, downgrade overall status
    const allVerifications = await listVerificationsByProviderProfile(verification.provider_profile_id);
    const hasApproved = allVerifications.some((v) => v.status === "approved" && v.id !== id);
    if (!hasApproved) {
      await updateProviderProfile(verification.provider_profile_id, {
        verification_status: "rejected",
      });
    }

    await logAudit({
      actorId: user.id,
      action: "verification.rejected",
      resourceType: "provider_verification",
      resourceId: id,
      metadata: { verification_type: verification.verification_type, reason: parsed.data.reason, provider_profile_id: verification.provider_profile_id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/admin/verifications/[id]/reject error:", error);
    return NextResponse.json({ error: "Failed to reject verification" }, { status: 500 });
  }
}
