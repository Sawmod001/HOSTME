import { pool } from "../src/lib/db.js";

const DEMO_HOST_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_ADMIN_ID = "00000000-0000-0000-0000-000000000002";

async function seed() {
  console.log("Seeding database...");

  // 1. Create demo host user
  await pool.query(
    `INSERT INTO users (id, clerk_id, name, email, roles, active_role, status, profile_completed, profile)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      DEMO_HOST_ID,
      "demo_host_clerk",
      "Demo Host",
      "demo@hostme.ng",
      ["guest", "host"],
      "host",
      "active",
      true,
      JSON.stringify({ fullName: "Demo Host", phone: "08012345678", location: "Lagos, Nigeria" }),
    ]
  );
  console.log("  ✓ Demo host user created");

  // 2. Create pending_review listings for admin to approve
  const pendingListings = [
    {
      host_id: DEMO_HOST_ID,
      vertical: "venue",
      sub_vertical: ["group_night"],
      booking_type: "exclusive",
      status: "pending_review",
      title: "Orca Lounge",
      description: "Ilorin's premier nightlife destination with a sophisticated atmosphere, fully stocked bar, pool tables, and VIP section.",
      location: JSON.stringify({ state: "Kwara", cityArea: "GRA", address: "15 Abdulazeez Attah Road", coordinates: { type: "Point", coordinates: [4.5429, 8.4966] } }),
      pricing: JSON.stringify({ baseRatePerHour: 1500000, inspectionTransportFee: 50000 }),
      operational_rules: JSON.stringify({ maxCapacity: 150, setupTimeMinutes: 60, cleanupTimeMinutes: 45, isByobAllowed: false, cancellationPolicy: "moderate" }),
      features: JSON.stringify({ groupNight: { gameTypes: ["pool", "video_games", "board_games"], hasPoolTable: true, maxGroupSize: 150, hasBar: true } }),
      add_ons: JSON.stringify([{ id: "dj", name: "DJ Setup", priceInKobo: 8000000, isRequired: false }]),
      media: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800"],
    },
    {
      host_id: DEMO_HOST_ID,
      vertical: "venue",
      sub_vertical: ["exclusive_space"],
      booking_type: "exclusive",
      status: "pending_review",
      title: "Havenda Center",
      description: "Premium event and conference center with air-conditioned halls, in-house catering, and state-of-the-art sound system.",
      location: JSON.stringify({ state: "Kwara", cityArea: "Tanke", address: "42 University Road", coordinates: { type: "Point", coordinates: [4.6710, 8.4791] } }),
      pricing: JSON.stringify({ baseRatePerHour: 2500000, inspectionTransportFee: 75000 }),
      operational_rules: JSON.stringify({ maxCapacity: 500, setupTimeMinutes: 120, cleanupTimeMinutes: 60, isByobAllowed: true, cancellationPolicy: "flexible" }),
      features: JSON.stringify({ exclusiveSpace: { privacyLevel: "fully_private", cateringOptions: ["in_house", "external"], inHouseCatering: true, maxGuests: 500 } }),
      add_ons: JSON.stringify([{ id: "catering", name: "Premium Catering", priceInKobo: 15000000, isRequired: false }]),
      media: ["https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800"],
    },
  ];

  for (const l of pendingListings) {
    const existing = await pool.query("SELECT id FROM listings WHERE title = $1", [l.title]);
    if (existing.rows.length === 0) {
      const r = await pool.query(
        `INSERT INTO listings (host_id, vertical, sub_vertical, booking_type, status, title, description,
          location, pricing, operational_rules, features, add_ons, media)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [l.host_id, l.vertical, l.sub_vertical, l.booking_type, l.status, l.title, l.description,
         l.location, l.pricing, l.operational_rules, l.features, l.add_ons, l.media]
      );
      console.log(`  ✓ Pending listing created: "${l.title}" (${r.rows[0].id})`);
    }
  }

  // 3. Also create some active listings
  const activeListings = [
    {
      host_id: DEMO_HOST_ID,
      vertical: "venue",
      sub_vertical: ["karaoke"],
      booking_type: "exclusive",
      status: "active",
      title: "Kolade Bar",
      description: "Ilorin's hottest karaoke and entertainment spot with professional equipment and private rooms.",
      location: JSON.stringify({ state: "Kwara", cityArea: "Taiwo Road", address: "28 Taiwo Road", coordinates: { type: "Point", coordinates: [4.5608, 8.4883] } }),
      pricing: JSON.stringify({ baseRatePerHour: 800000, inspectionTransportFee: 30000 }),
      operational_rules: JSON.stringify({ maxCapacity: 80, setupTimeMinutes: 30, cleanupTimeMinutes: 30, isByobAllowed: false, cancellationPolicy: "strict" }),
      features: JSON.stringify({ karaoke: { microphoneCount: 6, songGenres: ["afrobeats", "hip_hop", "rnb"], privateRoom: true, hasStage: true, soundSystem: "professional" } }),
      add_ons: JSON.stringify([{ id: "private_room", name: "Private Karaoke Room", priceInKobo: 2000000, isRequired: false }]),
      media: ["https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=800"],
    },
  ];

  for (const l of activeListings) {
    const existing = await pool.query("SELECT id FROM listings WHERE title = $1", [l.title]);
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO listings (host_id, vertical, sub_vertical, booking_type, status, title, description,
          location, pricing, operational_rules, features, add_ons, media)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [l.host_id, l.vertical, l.sub_vertical, l.booking_type, l.status, l.title, l.description,
         l.location, l.pricing, l.operational_rules, l.features, l.add_ons, l.media]
      );
      console.log(`  ✓ Active listing created: "${l.title}"`);
    }
  }

  console.log("\nSeed complete! Run the server and test the admin flow.");
  await pool.end();
}

seed().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
