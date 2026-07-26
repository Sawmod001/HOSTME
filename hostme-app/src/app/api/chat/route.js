import { GoogleGenerativeAI } from "@google/generative-ai";

const FALLBACK_REPLIES = [
  "I can help you find venues, understand booking types, or navigate your dashboard. What would you like to know?",
  "HostMe lets you browse venues, check availability, and book spaces. Try the Discover page to get started.",
  "You can sign up as a guest to book spaces, or as a host to list your venue. Both roles are supported.",
  "Capacity bookings let you reserve a slot in a shared space. Exclusive bookings give you the whole venue.",
  "Payments are processed in Nigerian Naira. Your booking is held temporarily while you complete payment.",
];

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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `You are HostMe AI, a helpful assistant for the HostMe platform. HostMe is a Nigerian marketplace for booking event spaces, venues, and experiences.

Key features:
- Browse listings across verticals: venues, housing, pre-order
- Two booking types: "capacity" (shared pay-per-slot) and "exclusive" (private booking)
- Hosts create and manage listings; guests book spaces
- Payments in Nigerian Naira (kobo — divide by 100 for Naira)
- Built with Next.js, PostgreSQL (Supabase), Clerk authentication
- Roles: guest, host, admin

Answer questions clearly and concisely in 2-3 sentences. If you don't know, say so.`,
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
      generationConfig: { temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 1024 },
    });

    const chat = model.startChat({
      history: (history || []).slice(-20).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });

    const result = await chat.sendMessage(message);
    const text = result.response.text();
    return Response.json({ reply: text });
  } catch (error) {
    console.error("Chat error:", error?.message);
    const msg = error?.message || "";

    if (msg.includes("429") || msg.includes("quota") || msg.includes("RATE_LIMIT") || msg.includes("Too Many Requests")) {
      const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
      return Response.json({
        reply: fallback,
        note: "AI is rate-limited. Here's a helpful tip instead.",
      });
    }

    if (msg.includes("API_KEY_INVALID") || msg.includes("API key not found")) {
      return Response.json({ error: "AI service key is invalid. Check your GEMINI_API_KEY." }, { status: 500 });
    }

    if (msg.includes("SAFETY") || msg.includes("blocked")) {
      return Response.json({ error: "Response blocked by safety filters. Please rephrase." }, { status: 400 });
    }

    const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
    return Response.json({
      reply: fallback,
      note: "I'm having trouble connecting. Here's a helpful tip instead.",
    });
  }
}
