import { pool } from "./db.js";
import { supabase } from "./supabase.js";

export async function resolveExclusiveLock({
  lockId,
  bookingId,
  listingId,
  eventStart,
  poolClient,
  supabaseClient,
}) {
  if (!lockId || !bookingId || !listingId || !eventStart) {
    return { ok: false, error: "Missing exclusive lock parameters" };
  }

  const dbClient = poolClient || pool;
  const dbSupabase = supabaseClient || supabase;

  try {
    const startStr = eventStart instanceof Date ? eventStart.toISOString() : eventStart;
    const result = await dbClient.query(
      `SELECT * FROM resolve_exclusive_lock($1, $2, $3, $4)`,
      [lockId, bookingId, listingId, startStr]
    );

    if (!result.rows.length) {
      await dbSupabase.from("bookings").update({ status: "lost_race" }).eq("id", bookingId);
      return { won: false, bookingId };
    }

    return { won: true, bookingId, lock: result.rows[0] };
  } catch (error) {
    await dbSupabase.from("bookings").update({ status: "lost_race" }).eq("id", bookingId);
    return { won: false, bookingId };
  }
}

export async function markWebhookProcessing({ bookingId, gatewayTransactionRef, supabaseClient }) {
  if (!bookingId || !gatewayTransactionRef) {
    return { ok: false, error: "Missing webhook processing parameters" };
  }

  try {
    const db = supabaseClient || supabase;
    await db.from("processed_webhooks").insert({
      gateway_transaction_ref: gatewayTransactionRef,
      booking_id: bookingId,
    });
    return { ok: true, duplicate: false };
  } catch (err) {
    if (err?.code === "23505") {
      return { ok: false, duplicate: true };
    }
    throw err;
  }
}