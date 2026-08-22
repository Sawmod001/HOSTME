import { supabase } from "./supabase.js";

// ===================== USERS =====================

export async function findUserByClerkId(clerkId) {
  const { data, error } = await supabase.from("users").select().eq("clerk_id", clerkId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function findUserById(id) {
  const { data, error } = await supabase.from("users").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createUser(userData) {
  const { data, error } = await supabase.from("users").insert(userData).select().single();
  if (error) throw error;
  return data;
}

export async function updateUserByClerkId(clerkId, updates) {
  const { data, error } = await supabase.from("users").update(updates).eq("clerk_id", clerkId).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function listUsers(filters = {}) {
  let query = supabase.from("users").select();
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ===================== LISTINGS =====================

export async function findListingById(id) {
  const { data, error } = await supabase.from("listings").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createListing(listingData) {
  const { data, error } = await supabase.from("listings").insert(listingData).select().single();
  if (error) throw error;
  return data;
}

export async function updateListing(id, updates) {
  const { data, error } = await supabase.from("listings").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function listListings({
  status, hostId, vertical, subVertical, bookingType, cityArea,
  cursor, limit = 50, offset = 0, orderBy = "created_at", orderDir = "desc",
} = {}) {
  let query = supabase.from("listings").select();
  if (status) query = query.eq("status", status);
  if (hostId) query = query.eq("host_id", hostId);
  if (vertical) query = query.eq("vertical", vertical);
  if (subVertical) query = query.contains("sub_vertical", [subVertical]);
  if (bookingType) query = query.eq("booking_type", bookingType);
  if (cityArea) query = query.eq("location->>cityArea", cityArea);
  if (cursor) query = query.gt("created_at", cursor);
  query = query.order(orderBy, { ascending: orderDir === "asc" }).range(offset, offset + limit - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function countListings(filters = {}) {
  let query = supabase.from("listings").select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

// ===================== BOOKINGS =====================

export async function findBookingById(id) {
  const { data, error } = await supabase.from("bookings").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createBooking(bookingData) {
  const { data, error } = await supabase.from("bookings").insert(bookingData).select().single();
  if (error) throw error;
  return data;
}

export async function updateBooking(id, updates) {
  const { data, error } = await supabase.from("bookings").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function listBookings(filters = {}, { limit = 50, offset = 0, orderBy = "created_at", orderDir = "desc" } = {}) {
  let query = supabase.from("bookings").select();
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  query = query.order(orderBy, { ascending: orderDir === "asc" }).range(offset, offset + limit - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ===================== REVIEWS =====================

export async function listReviews(listingId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createReview(reviewData) {
  const { data, error } = await supabase.from("reviews").insert(reviewData).select().single();
  if (error) throw error;
  return data;
}

export async function findReviewByBooking(bookingId) {
  const { data, error } = await supabase.from("reviews").select().eq("booking_id", bookingId).maybeSingle();
  if (error) throw error;
  return data;
}

// ===================== SLOTS =====================

export async function findSlotById(id) {
  const { data, error } = await supabase.from("slots").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSlot(slotData) {
  const { data, error } = await supabase.from("slots").insert(slotData).select().single();
  if (error) throw error;
  return data;
}

export async function updateSlot(id, updates) {
  const { data, error } = await supabase.from("slots").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSlots(filters = {}) {
  let query = supabase.from("slots").select();
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ===================== EXCLUSIVE LOCKS =====================

export async function findExclusiveLock(id) {
  const { data, error } = await supabase.from("exclusive_locks").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createExclusiveLock(lockData) {
  const { data, error } = await supabase.from("exclusive_locks").insert(lockData).select().single();
  if (error) throw error;
  return data;
}

export async function updateExclusiveLock(id, updates) {
  const { data, error } = await supabase.from("exclusive_locks").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function findExclusiveLockByListingAndTime(listingId, eventStart) {
  const { data, error } = await supabase
    .from("exclusive_locks")
    .select()
    .eq("listing_id", listingId)
    .eq("event_start", eventStart.toISOString())
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ===================== SOFT HOLDS =====================

export async function createSoftHold(holdData) {
  const { data, error } = await supabase.from("soft_holds").insert(holdData).select().single();
  if (error) throw error;
  return data;
}

export async function findSoftHoldsBySlotId(slotId) {
  const { data, error } = await supabase.from("soft_holds").select().eq("slot_id", slotId);
  if (error) throw error;
  return data || [];
}

// ===================== PROCESSED WEBHOOKS =====================

export async function createProcessedWebhook(webhookData) {
  const { data, error } = await supabase.from("processed_webhooks").insert(webhookData).select().single();
  if (error) throw error;
  return data;
}

export async function findProcessedWebhookByRef(ref) {
  const { data, error } = await supabase.from("processed_webhooks").select().eq("gateway_transaction_ref", ref).maybeSingle();
  if (error) throw error;
  return data;
}
