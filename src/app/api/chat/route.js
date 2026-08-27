import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";

const FALLBACK_REPLIES = [
  "I can help you find venues, understand booking types, or navigate your dashboard. What would you like to know?",
  "ClockHost lets you browse venues, check availability, and book spaces. Try the Discover page to get started.",
  "You can sign up as a guest to book spaces, or as a host to list your venue. Hosts and agents can list different types of spaces.",
  "Capacity bookings let you reserve a slot in a shared space. Exclusive bookings give you the whole venue.",
  "Payments are processed in Nigerian Naira. Your booking is held temporarily while you complete payment.",
];

const SYSTEM_PROMPT = `You are ClockHost AI, a helpful assistant for the ClockHost platform. ClockHost is a Nigerian marketplace for booking event spaces, venues, and experiences.

Key features:
- Browse listings across verticals: venues, housing
- Two booking types: "capacity" (shared pay-per-slot) and "exclusive" (private booking)
- Hosts create and manage listings; guests book spaces
- Payments in Nigerian Naira (kobo — divide by 100 for Naira)
- Built with Next.js, PostgreSQL (Supabase), Clerk authentication
- Roles: guest, host, admin

Answer questions clearly and concisely in 2-3 sentences. If you don't know, say so.`;

export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;

    const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 20 }, "chat");
    if (rateLimited) return rateLimited;

    const { message, history = [] } = await request.json();
    if (!message?.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 2000) {
      return Response.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "AI assistant is not configured" }, { status: 500 });
    }

    const contents = [
      ...(history || []).slice(-20).flatMap((m) => [
        { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] },
      ]),
      { role: "user", parts: [{ text: message }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] } }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Gemini API error:", res.status, errBody.slice(0, 500));

      if (res.status === 429) {
        return Response.json({ error: "AI service is temporarily unavailable (rate limit). Please try again later." }, { status: 429 });
      }
      if (res.status === 403 || /key|auth|API_KEY/i.test(errBody)) {
        return Response.json({ error: "AI service key is invalid. Check your GEMINI_API_KEY." }, { status: 500 });
      }
      return Response.json({ error: "AI service error. Please try again later." }, { status: 502 });
    }

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return Response.json({ reply: reply || "I couldn't generate a response. Please try again." });
  } catch (error) {
    console.error("Chat error:", error?.message);
    const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
    return Response.json({
      reply: fallback,
      note: "I'm having trouble connecting. Here's a helpful tip instead.",
    });
  }
}
