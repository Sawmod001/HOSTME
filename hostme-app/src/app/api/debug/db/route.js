import { pool } from "@/lib/db";
import fs from "fs";
import path from "path";
import { ok } from "@/lib/supabase-utils";

export async function GET() {
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

export async function POST() {
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
