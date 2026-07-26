import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Next.js loads .env automatically, but if this module is loaded before
  // that happens, read .env directly as a fallback.
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        const text = readFileSync(file, "utf-8");
        const match = text.match(/^DATABASE_URL=(.+)$/m);
        if (match) return match[1].trim();
      } catch {}
    }
  }
  return undefined;
}

const url = getDatabaseUrl();

if (!url) {
  console.error("[db.js] DATABASE_URL is not set and could not be loaded from .env/.env.local");
}

const pool = new Pool({
  connectionString: url,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  ssl: url ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("pg pool error:", err.message);
});

export { pool };
export default pool;
