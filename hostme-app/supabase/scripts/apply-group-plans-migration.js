import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();

  const check = await client.query(
    "SELECT to_regclass('public.group_plans') AS table_name"
  );
  const exists = check.rows[0]?.table_name;
  console.log("group_plans table exists:", !!exists);

  if (exists) {
    console.log("group_plans already present. Applying function as idempotent refresh…");
  }

  const sql = readFileSync("supabase/migration.sql", "utf8");

  // Only the GROUP PLANS & PLAN MEMBERS section (and anything after it, i.e.
  // the cancel_expired_group_plans function) is new. Everything before it
  // already exists in the production database. Extract from the marker.
  const marker = "-- GROUP PLANS & PLAN MEMBERS";
  const idx = sql.indexOf(marker);
  if (idx === -1) throw new Error("Group plans migration block not found in migration.sql");

  const block = sql.slice(idx);
  const cleaned = block
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  try {
    await client.query(cleaned);
    console.log("Group-plans migration applied successfully");
  } catch (e) {
    console.log("Migration error:", e.message);
  }

  const fn = await client.query(
    "SELECT to_regclass('public.group_plans') AS table_name, EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'cancel_expired_group_plans') AS has_fn"
  );
  console.log(
    "Verify — group_plans:",
    fn.rows[0]?.table_name,
    "| cancel_expired_group_plans function:",
    fn.rows[0]?.has_fn
  );

  await client.end();
}

run();