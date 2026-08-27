import { supabase } from "@/lib/db/supabase";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get a WhatsApp session by phone number.
 * Returns the state object or null if no session exists or it has expired.
 */
export async function getSession(phone) {
  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select("id, state, last_active_at")
    .eq("phone", phone)
    .maybeSingle();

  if (error || !data) return null;

  // Check if expired
  const lastActive = new Date(data.last_active_at).getTime();
  if (Date.now() - lastActive > SESSION_TTL_MS) {
    await supabase.from("whatsapp_sessions").delete().eq("id", data.id);
    return null;
  }

  return data.state;
}

/**
 * Set (upsert) a WhatsApp session state for a phone number.
 * Creates a new session or updates an existing one.
 */
export async function setSession(phone, state) {
  const { error } = await supabase
    .from("whatsapp_sessions")
    .upsert(
      { phone, state, last_active_at: new Date().toISOString() },
      { onConflict: "phone" }
    );

  if (error) console.error("[whatsapp-session] upsert failed:", error.message);
}

/**
 * Delete a WhatsApp session (on reset/menu).
 */
export async function deleteSession(phone) {
  const { error } = await supabase
    .from("whatsapp_sessions")
    .delete()
    .eq("phone", phone);

  if (error) console.error("[whatsapp-session] delete failed:", error.message);
}
