import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  const dbUrl = process.env.DATABASE_URL || "";

  // Pattern 1: postgresql://postgres.PROJECT_REF:password@pooler...
  const m1 = dbUrl.match(/postgres\.([^.]+?)(?::|@|\.)/);
  if (m1) return `https://${m1[1]}.supabase.co`;

  // Pattern 2: postgresql://user:password@db.PROJECT_REF.supabase.co
  const m2 = dbUrl.match(/@db\.([^.]+)\.supabase/);
  if (m2) return `https://${m2[1]}.supabase.co`;

  return null;
}

const supabaseUrl = getSupabaseUrl();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
