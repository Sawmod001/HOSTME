const FALLBACK_REPLIES = [
  "I can help you find venues, understand booking types, or navigate your dashboard. What would you like to know?",
  "HostMe lets you browse venues, check availability, and book spaces. Try the Discover page to get started.",
  "You can sign up as a guest to book spaces, or as a host to list your venue. Both roles are supported.",
  "Capacity bookings let you reserve a slot in a shared space. Exclusive bookings give you the whole venue.",
  "Payments are processed in Nigerian Naira. Your booking is held temporarily while you complete payment.",
];

const SYSTEM_PROMPT = `You are HostMe AI, a helpful assistant for the HostMe platform. HostMe is a Nigerian marketplace for booking event spaces, venues, and experiences.

Key features:
- Browse listings across verticals: venues, housing, pre-order
- Two booking types: "capacity" (shared pay-per-slot) and "exclusive" (private booking)
- Hosts create and manage listings; guests book spaces
- Payments in Nigerian Naira (kobo — divide by 100 for Naira)
- Built with Next.js, PostgreSQL (Supabase), Clerk authentication
- Roles: guest, host, admin

Answer questions clearly and concisely in 2-3 sentences. If you don't know, say so.`;

export async function POST(request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "AI assistant is not configured" }, { status: 500 });
    }

    const { message, history = [] } = await request.json();
    if (!message?.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 2000) {
      return Response.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
    }

    const contents = [
      ...(history || []).slice(-20).flatMap((m) => [
        { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] },
      ]),
      { role: "user", parts: [{ text: message }] },
    ];

    const body = JSON.stringify({ contents, systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] } });
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body }
    );

    const rawText = await res.text();

    if (!res.ok) {
      console.error("Gemini API error:", res.status, rawText.slice(0, 500));
      if (/quota|rate.?limit/i.test(rawText)) {
        const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
        return Response.json({ reply: fallback, note: "AI is rate-limited." });
      }
      if (res.status === 403 || /key|auth|API_KEY/i.test(rawText)) {
        return Response.json({ error: "AI service key is invalid." }, { status: 500 });
      }
      if (/safety|blocked/i.test(rawText)) {
        return Response.json({ error: "Response blocked by safety filters." }, { status: 400 });
      }
      const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
      return Response.json({ reply: fallback, note: "I'm having trouble connecting." });
    }

    const data = JSON.parse(rawText);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return Response.json({ reply: text || "I couldn't generate a response." });
  } catch (error) {
    console.error("Chat error:", error?.message);
    const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
    return Response.json({ reply: fallback, note: "I'm having trouble connecting." });
  }
}
