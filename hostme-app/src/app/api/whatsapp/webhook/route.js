import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { listListings } from "@/lib/db/supabase-queries";
import { getWhatsAppConfig, verifyWhatsAppSignature, sendWhatsAppText, sendWhatsAppList, sendWhatsAppButtons, markWhatsAppRead } from "@/lib/whatsapp/client";
import { handleMessage } from "@/lib/whatsapp/bot";
import { generateReply } from "@/lib/whatsapp/gemini";

const sessions = new Map();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const config = getWhatsAppConfig();

  if (mode === "subscribe" && token === config.verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Verification failed", { status: 403 });
}

export async function POST(request) {
  try {
    const config = getWhatsAppConfig();
    if (!config.token || !config.phoneNumberId) {
      console.error("[whatsapp] missing token or phone number id");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const rawBody = await request.text();
    const signature = (request.headers.get("x-hub-signature-256") || "").replace("sha256=", "");
    if (config.appSecret) {
      if (!verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
        console.error("[whatsapp] invalid webhook signature");
        return NextResponse.json({ ok: true }, { status: 200 });
      }
    } else {
      // Dev/test: without WHATSAPP_APP_SECRET there is nothing to verify against.
      // Process anyway so a missing secret doesn't silently kill the flow.
      console.warn("[whatsapp] WHATSAPP_APP_SECRET is not set — skipping signature verification");
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const deps = {
      baseUrl: process.env.HOSTME_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
      listActiveListings: async ({ area } = {}) => {
        const active = await listListings({ status: "active" });
        if (!area) return active;
        const needle = area.toLowerCase();
        return active.filter((listing) => {
          const loc = listing.location || {};
          const haystack = [loc.cityArea, loc.state, loc.address, loc.name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        });
      },
      listSlots: async (listingId) => {
        const { data, error } = await supabase
          .from("slots")
          .select()
          .eq("listing_id", listingId);
        if (error) throw error;
        return data || [];
      },
      generateReply,
    };

    for (const message of messages) {
      const phone = message.from;

      // Acknowledge promptly while the bot works on a reply.
      if (message.id) await markWhatsAppRead(message.id, config);

      const text = interactiveToText(message);
      if (text === null) {
        // Unsupported message type (image, reaction, etc.).
        await sendWhatsAppText(phone, 'I only understand text right now. Try "find a venue in Ikeja".', config);
        continue;
      }

      try {
        const replies = await handleMessage({
          phone,
          text,
          sessions,
          deps,
        });
        for (const reply of replies) {
          await sendDescriptor(phone, reply, config);
        }
      } catch (error) {
        console.error("[whatsapp] handler error:", error);
        await sendWhatsAppText(
          phone,
          "HostMe is having trouble reaching its venues right now. Try again in a moment.",
          config
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/whatsapp/webhook error:", error);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

// Map an incoming WhatsApp message (text or interactive tap) to the bot's text input.
// Returns null for message types the bot cannot process.
function interactiveToText(message) {
  if (message.type === "text") {
    return String(message.text?.body || "").trim();
  }
  if (message.type === "interactive") {
    const iv = message.interactive || {};
    if (iv.type === "list_reply") {
      return String(iv.list_reply?.id ?? iv.list_reply?.title ?? "").trim();
    }
    if (iv.type === "button_reply") {
      const id = String(iv.button_reply?.id ?? "").trim();
      if (id === "find_venue") return "find a venue";
      if (id === "group_booking") return "group booking";
      if (id === "about") return "about hostme";
      if (id === "help") return "menu";
      return id;
    }
  }
  return null;
}

async function sendDescriptor(to, descriptor, config) {
  if (descriptor?.kind === "list") {
    await sendWhatsAppList(to, descriptor, config);
    return;
  }
  if (descriptor?.kind === "buttons") {
    await sendWhatsAppButtons(to, descriptor, config);
    return;
  }
  await sendWhatsAppText(to, descriptor?.text ?? String(descriptor ?? ""), config);
}