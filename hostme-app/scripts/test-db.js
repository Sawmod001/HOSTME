import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function test() {
  try {
    const r = await pool.query(
      "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = $1 ORDER BY table_name, ordinal_position",
      ["public"]
    );
    const cols = {};
    for (const row of r.rows) {
      if (!cols[row.table_name]) cols[row.table_name] = [];
      cols[row.table_name].push(row.column_name);
    }
    for (const [t, c] of Object.entries(cols)) {
      console.log(t + " (" + c.length + " cols):", c.join(", "));
    }

    const cnt = await pool.query("SELECT COUNT(*)::int AS cnt FROM users");
    console.log("\nUsers count:", cnt.rows[0].cnt);
  } catch (e) {
    console.log("ERROR:", e.message);
  }
  await pool.end();
}

test();
