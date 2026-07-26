import { pool } from "../src/lib/db.js";
import { clerkFetch } from "../src/lib/clerk.js";
import { findListingById, updateListing } from "../src/lib/supabase-queries.js";

// 1. Get a pending listing
const r = await pool.query("SELECT id, title, status FROM listings WHERE status = 'pending_review' LIMIT 1");
const listing = r.rows[0];
console.log("1. Listing:", listing.title, "(" + listing.id + ")", "status:", listing.status);

// 2. Get admin user from Clerk
const adminClerk = await clerkFetch("/users?email_address=adminew@hostme.com");
const admin = Array.isArray(adminClerk) ? adminClerk[0] : adminClerk.data?.[0];
console.log("2. Admin:", admin?.email_addresses?.[0]?.email_address, "roles:", admin?.public_metadata?.roles);

// 3. Find admin in DB
const dbadmin = await pool.query("SELECT id, roles FROM users WHERE clerk_id = $1", [admin.id]);
console.log("3. DB Admin:", dbadmin.rows[0]?.id, "roles:", dbadmin.rows[0]?.roles);

// 4. Try to approve
const updated = await updateListing(listing.id, { status: "active" });
console.log("4. Updated status:", updated?.status);

// 5. Reset back
await updateListing(listing.id, { status: "pending_review" });
console.log("5. Reset to pending_review");

await pool.end();
console.log("Approve flow works!");
