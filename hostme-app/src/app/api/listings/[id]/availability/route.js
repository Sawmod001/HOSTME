import { findListingById } from "@/lib/db/supabase-queries";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, cachedOk, fail, notFound, parseId } from "@/lib/db/supabase-utils";

export async function GET(request, { params }) {
    try {
        const p = await params;
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get("date");
        if (!dateStr) return fail("Missing date query parameter", 400);
        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");
        if (listing.booking_type !== "exclusive") {
            return fail("Listing is not exclusive-space", 400);
        }

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
        console.error("GET /api/listings/availability error:", error);
        return fail("Failed to fetch availability", 500);
    }
}