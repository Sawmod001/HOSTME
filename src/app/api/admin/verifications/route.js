import { NextResponse } from "next/server";
import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/auth/getSessionUser";
import { findUserByClerkId, listPendingVerifications, countPendingVerifications } from "@/lib/db/supabase-queries";
import { validateCsrfOrigin } from "@/lib/csrf";

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
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status") || "pending";

    let verifications;
    let total;

    if (status === "pending") {
      verifications = await listPendingVerifications({ limit, offset });
      total = await countPendingVerifications();
    } else {
      // For non-pending, query directly with service_role
      const { supabaseAdmin } = await import("@/lib/db/supabase-admin");
      if (!supabaseAdmin) {
        return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
      }

      const { data, error, count } = await supabaseAdmin
        .from("provider_verifications")
        .select("*, provider_profiles!inner(id, user_id, business_name, provider_type, display_name)", { count: "exact" })
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      verifications = data || [];
      total = count || 0;
    }

    // Fetch user emails for each verification
    const { supabaseAdmin } = await import("@/lib/db/supabase-admin");
    const userIds = [...new Set(verifications.map((v) => v.provider_profiles?.user_id).filter(Boolean))];
    let userMap = {};

    if (userIds.length > 0 && supabaseAdmin) {
      const { data: usersData } = await supabaseAdmin
        .from("users")
        .select("id, email, name")
        .in("id", userIds);
      if (usersData) {
        userMap = Object.fromEntries(usersData.map((u) => [u.id, u]));
      }
    }

    const enriched = verifications.map((v) => ({
      ...v,
      provider_profiles: {
        ...v.provider_profiles,
        user: userMap[v.provider_profiles?.user_id] || null,
      },
    }));

    return NextResponse.json({ data: enriched, total });
  } catch (error) {
    console.error("GET /api/admin/verifications error:", error);
    return NextResponse.json({ error: "Failed to load verifications" }, { status: 500 });
  }
}
