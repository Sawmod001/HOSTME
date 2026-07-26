import { NextResponse } from "next/server";
import { listUsers } from "@/lib/supabase-queries.js";

export async function GET(request) {
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").filter(Boolean).map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k.trim(), v.join("=")];
      })
    );

    const sessionToken = cookies["__session"];
    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkRes = await fetch("https://api.clerk.com/v1/sessions/" + sessionToken, {
      headers: { Authorization: "Bearer " + process.env.CLERK_SECRET_KEY },
    });
    if (!clerkRes.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionData = await clerkRes.json();
    const userId = sessionData.user_id;

    const userRes = await fetch("https://api.clerk.com/v1/users/" + userId, {
      headers: { Authorization: "Bearer " + process.env.CLERK_SECRET_KEY },
    });
    const userData = await userRes.json();
    const roles = userData.public_metadata?.roles || [];

    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = (page - 1) * limit;

    const users = await listUsers();
    const paginated = users.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: users.length,
        totalPages: Math.ceil(users.length / limit),
      },
    });
  } catch (err) {
    console.error("Admin users error:", err);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
