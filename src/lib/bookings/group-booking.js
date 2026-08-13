import { pool } from "../db/connection.js";
import { supabase } from "../db/supabase.js";
import { findListingById, findSlotById } from "../db/supabase-queries.js";
import { computeCapacityPriceKobo } from "./pricing.js";

const PLAN_STATUSES = ["active", "finalized", "cancelled"];
const MEMBER_STATUSES = ["pending", "paid", "confirmed"];

export function hoursBetween(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, ms / (1000 * 60 * 60));
}

// A member's share of a group plan is the full capacity price for the hours
// their headcount covers, plus the add-ons they picked. Split across all
// members at finalize time — see finalizeGroupPlan.
export function computeShareKobo({ listing, plan, headcount, addOns }) {
  return computeCapacityPriceKobo({
    listing,
    eventStart: plan.event_start,
    eventEnd: plan.event_end,
    headcount,
    addOnIds: addOns,
  });
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
export async function createGroupPlan({ user, listingId, slotId, targetHeadcount, expiresAt, headcount = 1, addOns = [] }) {
  if (!user?.id || !listingId || !slotId || !targetHeadcount) {
    return { ok: false, status: 400, error: "Missing required plan details" };
  }

  const listing = await findListingById(listingId);
  if (!listing) return { ok: false, status: 404, error: "Listing not found" };
  if (listing.booking_type !== "capacity") return { ok: false, status: 400, error: "Group booking is only available on capacity listings" };
  if (listing.status !== "active") return { ok: false, status: 400, error: "Listing is not active" };

  const slot = await findSlotById(slotId);
  if (!slot) return { ok: false, status: 404, error: "Slot not found" };
  if (slot.listing_id !== listingId) return { ok: false, status: 400, error: "Slot does not belong to this listing" };

  const target = Number(targetHeadcount);
  if (!Number.isInteger(target) || target < 1) return { ok: false, status: 400, error: "Target headcount must be at least 1" };
  const remaining = Number(slot.capacity) - Number(slot.booked || 0);
  if (target > remaining) return { ok: false, status: 409, error: `Target headcount exceeds remaining slot capacity (${remaining})` };

  const myHeadcount = Number(headcount);
  if (!Number.isInteger(myHeadcount) || myHeadcount < 1) return { ok: false, status: 400, error: "Your headcount must be at least 1" };
  if (myHeadcount > target) return { ok: false, status: 400, error: "Your headcount cannot exceed the plan target" };

  const defaultExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiry = expiresAt ? new Date(expiresAt) : defaultExpiry;
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Plan deadline must be in the future" };
  }

  try {
    const plan = await withTransaction(async (client) => {
      const planRes = await client.query(
        `INSERT INTO group_plans
           (listing_id, slot_id, created_by, target_headcount, event_start, event_end, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         RETURNING *`,
        [listingId, slotId, user.id, target, slot.event_start, slot.event_end, expiry.toISOString()]
      );
      const created = planRes.rows[0];
      const share = computeShareKobo({ listing, plan: created, headcount: myHeadcount, addOns });
      const memberRes = await client.query(
        `INSERT INTO plan_members (plan_id, user_id, headcount, add_ons, share_amount_kobo, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [created.id, user.id, myHeadcount, JSON.stringify(addOns || []), share]
      );
      return { plan: created, member: memberRes.rows[0] };
    });

    return {
      ok: true,
      status: 201,
      data: { planId: plan.plan.id, memberId: plan.member.id, shareAmountKobo: plan.member.share_amount_kobo, expiresAt: plan.plan.expires_at },
    };
  } catch (error) {
    if (error?.code === "23503") return { ok: false, status: 404, error: "Slot or listing not found" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// JOIN
// ---------------------------------------------------------------------------
export async function joinGroupPlan({ user, planId, headcount, addOns }) {
  if (!user?.id || !planId || !headcount) {
    return { ok: false, status: 400, error: "Missing required join details" };
  }

  const { data: plan } = await supabase.from("group_plans").select().eq("id", planId).maybeSingle();
  if (!plan) return { ok: false, status: 404, error: "Plan not found" };
  if (plan.status !== "active") return { ok: false, status: 409, error: `Plan is already ${plan.status}` };
  if (new Date(plan.expires_at).getTime() <= Date.now()) return { ok: false, status: 409, error: "Plan has expired" };

  const listing = await findListingById(plan.listing_id);
  const slot = await findSlotById(plan.slot_id);
  if (!listing || !slot) return { ok: false, status: 404, error: "Plan venue not found" };

  const committed = await getCommittedHeadcount(planId);
  const requested = Number(headcount);
  if (!Number.isInteger(requested) || requested < 1) return { ok: false, status: 400, error: "Headcount must be at least 1" };
  if (committed + requested > Number(plan.target_headcount)) {
    return { ok: false, status: 409, error: `Only ${Number(plan.target_headcount) - committed} spots remain in this plan` };
  }

  const share = computeShareKobo({ listing, plan, headcount: requested, addOns });
  try {
    const { data, error } = await supabase.from("plan_members").insert({
      plan_id: planId,
      user_id: user.id,
      headcount: requested,
      add_ons: addOns || [],
      share_amount_kobo: share,
      status: "pending",
    }).select().single();
    if (error) return { ok: false, status: 400, error: error.message };
    return { ok: true, status: 201, data: { planId, memberId: data.id, shareAmountKobo: share } };
  } catch (error) {
    if (error?.code === "23505") return { ok: false, status: 409, error: "You already joined this plan" };
    throw error;
  }
}

async function getCommittedHeadcount(planId) {
  const { data: members } = await supabase.from("plan_members").select("headcount").eq("plan_id", planId);
  return (members || []).reduce((sum, m) => sum + Number(m.headcount), 0);
}

// ---------------------------------------------------------------------------
// FINALIZE  — the heart of the feature.
// Runs in ONE Postgres transaction: locks the plan, re-checks everyone has paid
// and the target is met, then reuses reserve_capacity_slot() so overselling is
// impossible, creates the booking (confirmed, all shares paid) and flips the
// plan + members. Idempotent: a second call sees status already 'finalized'.
// ---------------------------------------------------------------------------
export async function finalizeGroupPlan({ planId, poolClient }) {
  const ownsClient = !poolClient;
  const client = poolClient || await pool.connect();

  try {
    if (ownsClient) await client.query("BEGIN");

    const planRes = await client.query("SELECT * FROM group_plans WHERE id = $1 FOR UPDATE", [planId]);
    const plan = planRes.rows[0];
    if (!plan) return { ok: false, status: 404, error: "Plan not found" };
    if (plan.status !== "active") {
      return { ok: false, status: 409, error: `Plan is already ${plan.status}` };
    }
    if (new Date(plan.expires_at).getTime() <= Date.now()) {
      await client.query("UPDATE group_plans SET status = 'cancelled' WHERE id = $1", [planId]);
      return { ok: false, status: 409, error: "Plan expired" };
    }

    const membersRes = await client.query(
      `SELECT headcount, share_amount_kobo, status FROM plan_members WHERE plan_id = $1 FOR UPDATE`,
      [planId]
    );
    const members = membersRes.rows;
    if (!members.length) return { ok: false, status: 400, error: "No members in plan" };
    if (members.some((m) => m.status !== "paid")) {
      return { ok: false, status: 400, error: "Not all members have paid" };
    }

    const totalHeadcount = members.reduce((sum, m) => sum + Number(m.headcount), 0);
    if (totalHeadcount < Number(plan.target_headcount)) {
      return { ok: false, status: 400, error: "Plan has not reached its target headcount yet" };
    }
    const totalKobo = members.reduce((sum, m) => sum + Number(m.share_amount_kobo), 0);

    const reserved = await client.query("SELECT * FROM reserve_capacity_slot($1, $2, $3)", [
      plan.slot_id,
      plan.listing_id,
      totalHeadcount,
    ]);
    if (!reserved.rows[0]) {
      await client.query("UPDATE group_plans SET status = 'cancelled' WHERE id = $1", [planId]);
      return { ok: false, status: 409, error: "Slot became full before the plan finalized" };
    }

    const commissionKobo = Math.round(totalKobo * 0.05);
    const bookingRes = await client.query(
      `INSERT INTO bookings
         (listing_id, guest_id, booking_type, event_start, event_end, headcount, status, total_amount_kobo, commission_kobo)
       VALUES ($1, $2, 'capacity', $3, $4, $5, 'confirmed', $6, $7)
       RETURNING *`,
      [plan.listing_id, plan.created_by, plan.event_start, plan.event_end, totalHeadcount, totalKobo, commissionKobo]
    );
    const booking = bookingRes.rows[0];

    await client.query("UPDATE group_plans SET status = 'finalized', finalized_booking_id = $1 WHERE id = $2", [booking.id, planId]);
    await client.query("UPDATE plan_members SET status = 'confirmed' WHERE plan_id = $1", [planId]);

    if (ownsClient) await client.query("COMMIT");

    return {
      ok: true,
      status: 201,
      data: { bookingId: booking.id, totalAmountKobo: totalKobo, headcount: totalHeadcount },
    };
  } catch (error) {
    if (ownsClient) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

// ---------------------------------------------------------------------------
// VIEW
// ---------------------------------------------------------------------------
export async function getPlan({ planId, userId }) {
  const { data: plan } = await supabase.from("group_plans").select().eq("id", planId).maybeSingle();
  if (!plan) return null;

  const listing = await findListingById(plan.listing_id);
  const slot = await findSlotById(plan.slot_id);

  const { data: members } = await supabase.from("plan_members").select().eq("plan_id", planId).order("created_at", { ascending: true });
  const memberRows = members || [];

  const userIds = [...new Set(memberRows.map((m) => m.user_id).filter(Boolean))];
  let names = {};
  if (userIds.length) {
    const { data: users } = await supabase.from("users").select("id, name").in("id", userIds);
    for (const u of users || []) names[u.id] = u.name;
  }

  const committed = memberRows.reduce((sum, m) => sum + Number(m.headcount), 0);
  const paid = memberRows.filter((m) => m.status === "paid" || m.status === "confirmed").length;
  const myMember = userId ? memberRows.find((m) => m.user_id === userId) || null : null;

  return {
    id: plan.id,
    listingId: plan.listing_id,
    slotId: plan.slot_id,
    createdBy: plan.created_by,
    targetHeadcount: Number(plan.target_headcount),
    eventStart: plan.event_start,
    eventEnd: plan.event_end,
    expiresAt: plan.expires_at,
    status: plan.status,
    finalizedBookingId: plan.finalized_booking_id,
    createdAt: plan.created_at,
    listing: listing ? { id: listing.id, title: listing.title, bookingType: listing.booking_type, vertical: listing.vertical, location: listing.location, pricing: listing.pricing, media: listing.media, addOns: listing.add_ons, operationalRules: listing.operational_rules } : null,
    slot: slot ? { id: slot.id, capacity: slot.capacity, booked: slot.booked } : null,
    members: memberRows.map((m) => ({ id: m.id, userId: m.user_id, name: names[m.user_id] || "Guest", headcount: Number(m.headcount), shareAmountKobo: Number(m.share_amount_kobo), status: m.status })),
    committed,
    remaining: Math.max(0, Number(plan.target_headcount) - committed),
    paid,
    isMember: !!myMember,
    myMember: myMember ? { id: myMember.id, headcount: Number(myMember.headcount), shareAmountKobo: Number(myMember.share_amount_kobo), status: myMember.status } : null,
  };
}

// ---------------------------------------------------------------------------
// LIST (dashboard)
// ---------------------------------------------------------------------------
export async function listPlansForUser({ userId }) {
  if (!userId) return [];

  const { data: mine } = await supabase.from("group_plans").select().eq("created_by", userId);
  const { data: memberships } = await supabase.from("plan_members").select("plan_id").eq("user_id", userId);
  const memberPlanIds = (memberships || []).map((m) => m.plan_id);
  const { data: joined } = memberPlanIds.length
    ? await supabase.from("group_plans").select().in("id", memberPlanIds)
    : { data: [] };

  const seen = new Map();
  for (const plan of [...(mine || []), ...(joined || [])]) seen.set(plan.id, plan);
  const plans = [...seen.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!plans.length) return [];

  const ids = plans.map((p) => p.id);
  const listingIds = [...new Set(plans.map((p) => p.listing_id))];

  const { data: listings } = listingIds.length
    ? await supabase.from("listings").select("id, title, media").in("id", listingIds)
    : { data: [] };
  const listingById = new Map((listings || []).map((l) => [l.id, l]));

  const { data: memberRows } = await supabase.from("plan_members").select("plan_id, headcount").in("plan_id", ids);
  const committedByPlan = new Map();
  for (const member of memberRows || []) {
    committedByPlan.set(member.plan_id, (committedByPlan.get(member.plan_id) || 0) + Number(member.headcount));
  }

  return plans.map((p) => ({
    id: p.id,
    listingId: p.listing_id,
    listingTitle: listingById.get(p.listing_id)?.title || "Venue",
    listingMedia: (listingById.get(p.listing_id)?.media || [])[0] || null,
    eventStart: p.event_start,
    eventEnd: p.event_end,
    targetHeadcount: Number(p.target_headcount),
    committed: committedByPlan.get(p.id) || 0,
    status: p.status,
    expiresAt: p.expires_at,
    createdAt: p.created_at,
    finalizedBookingId: p.finalized_booking_id,
  }));
}

export { PLAN_STATUSES, MEMBER_STATUSES };