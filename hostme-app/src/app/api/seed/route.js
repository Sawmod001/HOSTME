import { findUserById, createUser } from "@/lib/supabase-queries";
import { supabase } from "@/lib/supabase";
import { ok, fail } from "@/lib/supabase-utils";

const DEMO_HOST_ID = "00000000-0000-0000-0000-000000000001";

const LISTINGS = [
    {
        vertical: "venue",
        booking_type: "capacity",
        status: "active",
        title: "Skyline Lounge",
        description: "A polished lounge space for screenings, private tables, and social gatherings.",
        location: { state: "Lagos", cityArea: "Lekki", address: "14 Admiralty Way", coordinates: { type: "Point", coordinates: [3.4733, 6.4658] } },
        pricing: { baseRatePerHour: 2500000 },
        operational_rules: { maxCapacity: 40, setupTimeMinutes: 30, cleanupTimeMinutes: 30, isByobAllowed: true, cancellationPolicy: "moderate" },
        add_ons: [{ id: "generator", name: "Generator Backup", priceInKobo: 1500000, isRequired: false }],
    },
    {
        vertical: "venue",
        booking_type: "exclusive",
        status: "active",
        title: "Harbor Private Room",
        description: "An exclusive buyout room for birthdays, shoots, and private events.",
        location: { state: "Lagos", cityArea: "Ikeja", address: "2 Allen Avenue", coordinates: { type: "Point", coordinates: [3.3462, 6.6018] } },
        pricing: { baseRatePerHour: 3500000 },
        operational_rules: { maxCapacity: 20, setupTimeMinutes: 30, cleanupTimeMinutes: 30, isByobAllowed: false, cancellationPolicy: "strict" },
        add_ons: [{ id: "decor", name: "Decor Pack", priceInKobo: 1000000, isRequired: false }],
    },
];

export async function POST() {
    try {
        const existingUser = await findUserById(DEMO_HOST_ID);
        if (!existingUser) {
            await createUser({
                id: DEMO_HOST_ID,
                name: "Demo Host",
                email: "demo@hostme.ng",
                roles: ["guest", "host"],
                active_role: "host",
                status: "active",
                profile_completed: true,
                profile: { fullName: "Demo Host", phone: "08012345678", location: "Lagos, Nigeria" },
            });
        }

        let created = 0;
        for (const listingData of LISTINGS) {
            const { data: existing } = await supabase
                .from("listings")
                .select("id")
                .eq("title", listingData.title)
                .maybeSingle();
            if (existing) continue;

            const { data: listing } = await supabase
                .from("listings")
                .insert({ host_id: DEMO_HOST_ID, ...listingData })
                .select()
                .single();

            if (listing.booking_type === "capacity") {
                const dates = [];
                for (let d = 0; d < 7; d++) {
                    const day = new Date();
                    day.setDate(day.getDate() + d);
                    day.setHours(10, 0, 0, 0);
                    const end = new Date(day);
                    end.setHours(22, 0, 0, 0);

                    const { data: slotExists } = await supabase
                        .from("slots")
                        .select("id")
                        .eq("listing_id", listing.id)
                        .eq("event_start", day.toISOString())
                        .maybeSingle();
                    if (!slotExists) {
                        dates.push({
                            listing_id: listing.id,
                            event_start: day.toISOString(),
                            event_end: end.toISOString(),
                            capacity: listingData.operational_rules.maxCapacity,
                            booked: 0,
                        });
                    }
                }
                if (dates.length > 0) {
                    await supabase.from("slots").insert(dates);
                }
            }

            if (listing.booking_type === "exclusive") {
                const dates = [];
                for (let d = 0; d < 7; d++) {
                    const day = new Date();
                    day.setDate(day.getDate() + d);
                    day.setHours(10, 0, 0, 0);
                    const end = new Date(day);
                    end.setHours(22, 0, 0, 0);

                    const { data: lockExists } = await supabase
                        .from("exclusive_locks")
                        .select("id")
                        .eq("listing_id", listing.id)
                        .eq("event_start", day.toISOString())
                        .maybeSingle();
                    if (!lockExists) {
                        dates.push({
                            listing_id: listing.id,
                            event_start: day.toISOString(),
                            event_end: end.toISOString(),
                            status: "open",
                        });
                    }
                }
                if (dates.length > 0) {
                    await supabase.from("exclusive_locks").insert(dates);
                }
            }

            created++;
        }

        return ok({ ok: true, listingsCreated: created, demoHostId: DEMO_HOST_ID });
    } catch (error) {
        console.error("POST /api/seed error:", error);
        return fail("Seed failed", 500);
    }
}