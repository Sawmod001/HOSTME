import { supabase } from "../db/supabase.js";

export async function sweepExpiredHolds() {
  const { data, error } = await supabase.rpc("release_expired_holds");
  if (error) {
    console.error("[sweepExpiredHolds] Error:", error);
    return { released: 0 };
  }
  return { released: data?.[0]?.released || 0 };
}