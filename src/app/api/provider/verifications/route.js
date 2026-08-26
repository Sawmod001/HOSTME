import { NextResponse } from "next/server";
import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/auth/getSessionUser";
import { findUserByClerkId, findProviderProfileByUserId, createVerification, listVerificationsByProviderProfile } from "@/lib/db/supabase-queries";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const SubmitVerificationSchema = z.object({
  verification_type: z.enum(["identity", "business", "property_authority"]),
  documents: z.array(z.object({
    url: z.string().url(),
    name: z.string().min(1).max(200),
  })).min(1).max(5),
});

export async function GET(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await findUserByClerkId(sessionInfo.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const profile = await findProviderProfileByUserId(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });
    }

    const verifications = await listVerificationsByProviderProfile(profile.id);

    return NextResponse.json({ data: verifications });
  } catch (error) {
    console.error("GET /api/provider/verifications error:", error);
    return NextResponse.json({ error: "Failed to load verifications" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const rateLimitResponse = checkRateLimit(request, { windowMs: 60_000, max: 5 }, "submit-verification");
    if (rateLimitResponse) return rateLimitResponse;

    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await findUserByClerkId(sessionInfo.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role !== "venue_host" && user.role !== "housing_agent") {
      return NextResponse.json({ error: "Only providers can submit verifications" }, { status: 403 });
    }

    const profile = await findProviderProfileByUserId(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = SubmitVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { verification_type, documents } = parsed.data;

    // Check if there's already a pending verification of this type
    const existing = await listVerificationsByProviderProfile(profile.id);
    const pendingExisting = existing.find(
      (v) => v.verification_type === verification_type && v.status === "pending"
    );
    if (pendingExisting) {
      return NextResponse.json(
        { error: "You already have a pending verification of this type. Please wait for it to be reviewed." },
        { status: 409 }
      );
    }

    const verification = await createVerification({
      provider_profile_id: profile.id,
      verification_type,
      status: "pending",
      documents,
    });

    // Update provider profile verification_status to 'pending' if currently 'none' or 'rejected'
    if (profile.verification_status === "none" || profile.verification_status === "rejected") {
      const { updateProviderProfile } = await import("@/lib/db/supabase-queries");
      await updateProviderProfile(profile.id, { verification_status: "pending" });
    }

    await logAudit({
      actorId: user.id,
      action: "verification.submitted",
      resourceType: "provider_verification",
      resourceId: verification.id,
      metadata: { verification_type, document_count: documents.length },
    });

    return NextResponse.json({ data: verification }, { status: 201 });
  } catch (error) {
    console.error("POST /api/provider/verifications error:", error);
    return NextResponse.json({ error: "Failed to submit verification" }, { status: 500 });
  }
}
