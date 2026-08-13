import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { findListingById, createSlot } from "@/lib/db/supabase-queries";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, cachedOk, fail, notFound, unauthorised, forbidden, parseId } from "@/lib/db/supabase-utils";

export async function GET(request, { params }) {
    try {
        const p = await params;
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get("date");
        const monthView = searchParams.get("monthView") === "true";
        if (!dateStr) return fail("Missing date query parameter", 400);
        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");
        if (listing.booking_type !== "capacity") {
            return fail("Listing is not capacity-based", 400);
        }

        const date = new Date(dateStr);
        let dayStart, dayEnd;
        if (monthView) {
            dayStart = new Date(date.getFullYear(), date.getMonth(), 1);
            dayEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        } else {
            dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            dayEnd = new Date(dayStart.getTime() + 86400000);
        }

        const { data: slots } = await supabase
            .from("slots")
            .select()
            .eq("listing_id", p.id)
            .gte("event_start", dayStart.toISOString())
            .lt("event_start", dayEnd.toISOString());

        const slotsWithAvailability = (slots || []).map((slot) => ({
            ...slot,
            available: slot.capacity - slot.booked,
            percentFilled: Math.round(((slot.booked / slot.capacity) * 100) || 0),
        }));

        return cachedOk({ data: slotsWithAvailability.map(toCamelCase) });
    } catch (error) {
        console.error("GET /api/listings/slots error:", error);
        return fail("Failed to fetch slots", 500);
    }
}

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
        if (listing.booking_type !== "capacity") return fail("Only capacity listings support slots", 400);

        const body = await request.json();
        const { eventStart, eventEnd, capacity } = body;
        if (!eventStart || !eventEnd || !capacity) return fail("Missing eventStart, eventEnd, or capacity", 400);
        if (new Date(eventStart) >= new Date(eventEnd)) return fail("eventStart must be before eventEnd", 400);
        if (capacity < 1) return fail("Capacity must be at least 1", 400);

        const slot = await createSlot({
            listing_id: p.id,
            event_start: new Date(eventStart).toISOString(),
            event_end: new Date(eventEnd).toISOString(),
            capacity,
            booked: 0,
        });

        return ok(toCamelCase(slot), 201);
    } catch (error) {
        console.error("POST /api/listings/slots error:", error);
        return fail("Failed to create slot", 500);
    }
}