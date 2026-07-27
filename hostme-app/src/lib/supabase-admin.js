import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  const dbUrl = process.env.DATABASE_URL || "";
  const match = dbUrl.match(/postgres\.([^:]+)/);
  if (match) return `https://${match[1]}.supabase.co`;
  return null;
}

const supabaseUrl = getSupabaseUrl();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
