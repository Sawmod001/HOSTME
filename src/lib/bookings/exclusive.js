import { pool } from "../db/connection.js";
import { supabase } from "../db/supabase.js";

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
    // Distinguish real race conditions from transient DB errors.
    // PostgreSQL error 40001 = serialization_failure (race condition detected).
    // Any other error is transient and should NOT mark the booking as lost.
    const isRealRace = error?.code === "40001" || error?.code === "23505";
    if (!isRealRace) {
      console.error("resolveExclusiveLock transient error:", error);
      return { ok: false, error: "Transient database error, please retry", bookingId };
    }
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