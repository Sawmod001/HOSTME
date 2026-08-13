import { pool } from "@/lib/db";
import fs from "fs";
import path from "path";
import { ok } from "@/lib/supabase-utils";

function isAuthorized(request) {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.DEBUG_SECRET;
  const provided = request.headers.get("x-debug-token");
  return !!expected && !!provided && provided === expected;
}

function denied() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(request) {
  if (!isAuthorized(request)) return denied();

  const envPath = path.resolve(process.cwd(), ".env");
  let dotenv = { exists: false, readable: false, hasDatabaseUrl: false };
  try {
    dotenv.exists = fs.existsSync(envPath);
    if (dotenv.exists) {
      fs.accessSync(envPath, fs.constants.R_OK);
      dotenv.readable = true;
      const text = fs.readFileSync(envPath, "utf-8");
      dotenv.hasDatabaseUrl = /^DATABASE_URL=/m.test(text);
    }
  } catch {
    dotenv.readable = false;
  }

  const url = process.env.DATABASE_URL;
  const data = {
    databaseUrlDefined: !!url,
    databaseUrlLength: url ? url.length : 0,
    cwd: process.cwd(),
    envFile: dotenv,
    nodeEnv: process.env.NODE_ENV || "not set",
  };

  return ok({ ok: true, data });
}

export async function POST(request) {
  if (!isAuthorized(request)) return denied();

  try {
    const result = await pool.query("SELECT 1 AS ok");
    return ok({ ok: true, data: { select1: result.rows[0] } });
  } catch (error) {
    return ok({
      ok: false,
      data: { error: error?.message || String(error) },
    });
  }
}