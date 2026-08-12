import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { findListingById, createExclusiveLock } from "@/lib/supabase-queries";
import { supabase } from "@/lib/supabase";
import { toCamelCase, ok, cachedOk, fail, notFound, unauthorised, forbidden, parseId } from "@/lib/supabase-utils";

export async function POST(request, { params }) {
    try {
        const p = await params;
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return unauthorised("No session");
        const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
        if (!isValid) return unauthorised("Invalid session");

        const user = await getUser(sessionInfo.userId);
        if (!user) return unauthorised("User not found");
        const roles = user.roles || [];

        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");
        if (listing.host_id !== user.id && !roles.includes("admin")) return forbidden("Not your listing");
        if (listing.booking_type !== "exclusive") return fail("Only exclusive listings support locks", 400);

        const body = await request.json();
        const { eventStart, eventEnd } = body;
        if (!eventStart || !eventEnd) return fail("Missing eventStart or eventEnd", 400);

        const start = new Date(eventStart);
        const end = new Date(eventEnd);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return fail("Invalid event date", 400);
        if (start >= end) return fail("eventStart must be before eventEnd", 400);
        if (start <= new Date()) return fail("eventStart must be in the future", 400);

        const existing = await supabase
            .from("exclusive_locks")
            .select("id")
            .eq("listing_id", p.id)
            .eq("event_start", start.toISOString())
            .maybeSingle();
        if (existing.data) return fail("A lock for this time window already exists", 409);

        const lock = await createExclusiveLock({
            listing_id: p.id,
            event_start: start.toISOString(),
            event_end: end.toISOString(),
            status: "open",
        });

        return ok(toCamelCase(lock), 201);
    } catch (error) {
        console.error("POST /api/listings/[id]/exclusive-locks error:", error);
        return fail("Failed to create exclusive lock", 500);
    }
}

export async function GET(request, { params }) {
    try {
        const p = await params;
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get("date");
        if (!dateStr) return fail("Missing date query parameter", 400);
        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");
        if (listing.booking_type !== "exclusive") return fail("Listing is not exclusive", 400);

        const date = new Date(dateStr);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);

        const { data: locks } = await supabase
            .from("exclusive_locks")
            .select()
            .eq("listing_id", p.id)
            .gte("event_start", dayStart.toISOString())
            .lt("event_start", dayEnd.toISOString());

        return cachedOk({ data: (locks || []).map(toCamelCase) });
    } catch (error) {
        console.error("GET /api/listings/[id]/exclusive-locks error:", error);
        return fail("Failed to fetch exclusive locks", 500);
    }
}
