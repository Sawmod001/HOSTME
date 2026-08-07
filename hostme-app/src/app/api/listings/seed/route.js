import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { createListing, createSlot, createExclusiveLock, countListings } from "@/lib/supabase-queries";
import { supabase } from "@/lib/supabase";
import { ok, fail } from "@/lib/supabase-utils";

const DEMO_LISTINGS = [
  {
    vertical: "venue",
    sub_vertical: ["group_night"],
    booking_type: "exclusive",
    title: "Orca Lounge",
    description: "Ilorin's premier nightlife destination. Orca Lounge offers a sophisticated atmosphere with a fully stocked bar, pool tables, video gaming stations, board games, and a dedicated VIP section.",
    location: { state: "Kwara", cityArea: "GRA", address: "15 Abdulazeez Attah Road, GRA, Ilorin", coordinates: { type: "Point", coordinates: [4.5429, 8.4966] } },
    pricing: { baseRatePerHour: 1500000, inspectionTransportFee: 50000 },
    operational_rules: { maxCapacity: 150, setupTimeMinutes: 60, cleanupTimeMinutes: 45, isByobAllowed: false, cancellationPolicy: "moderate" },
    features: { groupNight: { gameTypes: ["pool", "video_games", "board_games", "darts"], hasPoolTable: true, hasVideoGames: true, hasBoardGames: true, maxGroupSize: 150, hasBar: true } },
    media: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800", "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=800", "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800"],
    add_ons: [{ id: "dj", name: "DJ Setup", priceInKobo: 8000000, isRequired: false }, { id: "catering", name: "Premium Catering", priceInKobo: 15000000, isRequired: false }, { id: "deco", name: "Birthday Decoration", priceInKobo: 5000000, isRequired: false }],
  },
  {
    vertical: "venue",
    sub_vertical: ["exclusive_space"],
    booking_type: "exclusive",
    title: "Havenda Center",
    description: "A premium event and conference center in the heart of Ilorin. Havenda Center features fully air-conditioned halls, in-house catering, state-of-the-art sound system, and elegant decor.",
    location: { state: "Kwara", cityArea: "Tanke", address: "42 University Road, Tanke, Ilorin", coordinates: { type: "Point", coordinates: [4.6710, 8.4791] } },
    pricing: { baseRatePerHour: 2500000, inspectionTransportFee: 75000 },
    operational_rules: { maxCapacity: 500, setupTimeMinutes: 120, cleanupTimeMinutes: 60, isByobAllowed: true, cancellationPolicy: "flexible" },
    features: { exclusiveSpace: { privacyLevel: "fully_private", cateringOptions: ["in_house", "external"], inHouseCatering: true, maxGuests: 500 } },
    media: ["https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800", "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800", "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800"],
    add_ons: [{ id: "catering_standard", name: "Standard Catering (per head)", priceInKobo: 350000, isRequired: false }, { id: "catering_premium", name: "Premium Catering (per head)", priceInKobo: 650000, isRequired: false }, { id: "sound_system", name: "Professional Sound System", priceInKobo: 3000000, isRequired: false }, { id: "photography", name: "Event Photography", priceInKobo: 2000000, isRequired: false }],
  },
  {
    vertical: "venue",
    sub_vertical: ["karaoke"],
    booking_type: "exclusive",
    title: "Kolade Bar",
    description: "Ilorin's hottest karaoke and entertainment spot. Kolade Bar boasts professional-grade karaoke equipment, a massive song library spanning multiple genres, a dedicated stage, private rooms for groups, and a lively bar atmosphere.",
    location: { state: "Kwara", cityArea: "Taiwo Road", address: "28 Taiwo Road, Ilorin", coordinates: { type: "Point", coordinates: [4.5608, 8.4883] } },
    pricing: { baseRatePerHour: 800000, inspectionTransportFee: 30000 },
    operational_rules: { maxCapacity: 80, setupTimeMinutes: 30, cleanupTimeMinutes: 30, isByobAllowed: false, cancellationPolicy: "strict" },
    features: { karaoke: { microphoneCount: 6, songGenres: ["afrobeats", "hip_hop", "rnb", "gospel", "highlife", "pop"], privateRoom: true, hasStage: true, soundSystem: "professional" } },
    media: ["https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=800", "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800", "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800"],
    add_ons: [{ id: "private_room", name: "Private Karaoke Room", priceInKobo: 2000000, isRequired: false }, { id: "recording", name: "Session Recording", priceInKobo: 1500000, isRequired: false }, { id: "drinks_package", name: "Drinks Package (per person)", priceInKobo: 150000, isRequired: false }],
  },
];

export async function POST(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return fail("Unauthorized", 401);
    const isValid = await verifyClerkSession(sessionInfo.sessionId);
    if (!isValid) return fail("Unauthorized", 401);

    const existingCount = await countListings({ status: "active" });
    if (existingCount > 0) {
      return ok({ message: "Active listings already exist", count: existingCount });
    }

    const user = await getUser(sessionInfo.userId);
    if (!user) return fail("User not found", 404);

    const created = [];
    for (const data of DEMO_LISTINGS) {
      const listing = await createListing({
        host_id: user.id,
        ...data,
        status: "active",
      });
      created.push(listing.id);

      if (data.booking_type === "exclusive") {
        const now = new Date();
        for (let w = 0; w < 4; w++) {
          const sat = new Date(now);
          sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7) + w * 7);
          for (const h of [14, 18, 21]) {
            const start = new Date(sat);
            start.setHours(h, 0, 0, 0);
            const end = new Date(start);
            end.setHours(h + 3, 0, 0, 0);
            if (start > now) {
              const existing = await supabase
                .from("exclusive_locks")
                .select("id")
                .eq("listing_id", listing.id)
                .eq("event_start", start.toISOString())
                .maybeSingle();
              if (!existing.data) {
                await createExclusiveLock({
                  listing_id: listing.id,
                  event_start: start.toISOString(),
                  event_end: end.toISOString(),
                  status: "open",
                });
              }
            }
          }
        }
      } else if (data.booking_type === "capacity") {
        const now = new Date();
        for (let d = 0; d < 14; d++) {
          const day = new Date(now);
          day.setDate(now.getDate() + d);
          if (day > now) {
            for (const h of [9, 12, 15, 18]) {
              const start = new Date(day);
              start.setHours(h, 0, 0, 0);
              const end = new Date(start);
              end.setHours(h + 2, 0, 0, 0);
              const existing = await supabase
                .from("slots")
                .select("id")
                .eq("listing_id", listing.id)
                .eq("event_start", start.toISOString())
                .maybeSingle();
              if (!existing.data) {
                await createSlot({
                  listing_id: listing.id,
                  event_start: start.toISOString(),
                  event_end: end.toISOString(),
                  capacity: data.operational_rules?.maxCapacity || 20,
                  booked: 0,
                });
              }
            }
          }
        }
      }
    }

    return ok({ message: "Demo listings created", ids: created });
  } catch (error) {
    console.error("POST /api/listings/seed error:", error);
    return fail("Failed to seed listings", 500);
  }
}