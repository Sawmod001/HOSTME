import { pool } from "../src/lib/db.js";

const r = await pool.query("SELECT id, title, status FROM listings WHERE status = $1", ["pending_review"]);
console.log("Pending listings:", r.rows.length);
for (const l of r.rows) console.log("  -", l.title, "(" + l.id + ")");

const u = await pool.query("SELECT id, name, roles FROM users");
console.log("Users:", u.rows.length);
for (const x of u.rows) console.log("  -", x.name, "roles:", x.roles);

await pool.end();
