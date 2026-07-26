import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query("SELECT * FROM release_expired_holds()");
    const released = result.rows[0]?.released ?? 0;
    return Response.json({ ok: true, released });
  } catch (error) {
    console.error("GET /api/cron/release-expired-holds error:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
