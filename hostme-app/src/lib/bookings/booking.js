import { pool as defaultPool } from "../db/connection.js";
import { createSoftHold as defaultCreateSoftHold } from "../db/supabase-queries.js";

export async function reserveCapacitySlot({
  slotId,
  listingId,
  headcount,
  expiresInMinutes = 10,
  poolClient,
  createSoftHoldFn,
}) {
  if (!slotId || !listingId || !headcount) {
    return { ok: false, status: 400, error: "Missing reservation parameters" };
  }
  if (headcount < 1) {
    return { ok: false, status: 400, error: "Headcount must be at least 1" };
  }

  const db = poolClient || defaultPool;

  const result = await db.query(
    `SELECT * FROM reserve_capacity_slot($1, $2, $3)`,
    [slotId, listingId, headcount]
  );

  const updatedSlot = result.rows[0];
  if (!updatedSlot) {
    return { ok: false, status: 409, error: "Slot is full or unavailable" };
  }

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  const createHold = createSoftHoldFn || defaultCreateSoftHold;
  const softHold = await createHold({
    slot_id: slotId,
    headcount,
    expires_at: expiresAt.toISOString(),
    booking_id: null,
  });

  return {
    ok: true,
    status: 201,
    data: {
      slotId,
      softHoldId: softHold.id,
      expiresAt: expiresAt.toISOString(),
      headcount,
      booked: updatedSlot.booked,
      capacity: updatedSlot.capacity,
    },
  };
}