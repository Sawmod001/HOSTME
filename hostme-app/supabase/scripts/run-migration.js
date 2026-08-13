import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();

  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  console.log("Existing tables:", tables.rows.map((r) => r.table_name).join(", ") || "(none)");

  if (tables.rows.length > 0) {
    console.log("Tables already exist. Skipping.");
    await client.end();
    return;
  }

  const sql = readFileSync("supabase/migration.sql", "utf8");

  // Remove comment lines
  const cleaned = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  try {
    await client.query(cleaned);
    console.log("Migration completed successfully");
  } catch (e) {
    console.log("Migration error:", e.message);
  }

  const tables2 = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  console.log("Tables now:", tables2.rows.map((r) => r.table_name).join(", "));

  await client.end();
}

run();
