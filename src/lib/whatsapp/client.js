import crypto from "crypto";

const GRAPH_URL = "https://graph.facebook.com/v25.0";

function creds(config) {
  const token = config?.token || process.env.WHATSAPP_TOKEN;
  const phoneNumberId = config?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WhatsApp is not configured");
  return { token, phoneNumberId };
}

async function graphPost(config, payload) {
  const { token, phoneNumberId } = creds(config);
  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("WhatsApp send error:", res.status, errBody.slice(0, 500));
    throw new Error(`WhatsApp send failed (${res.status})`);
  }
  return res.json();
}

export function getWhatsAppConfig() {
  return {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
  };
}

export function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signatureHeader || "", "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function sendWhatsAppText(to, body, config) {
  return graphPost(config, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  });
}

export async function sendWhatsAppList(to, { body, button = "View options", sections = [] }, config) {
  return graphPost(config, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: String(body || "").slice(0, 1024) },
      action: { button, sections },
    },
  });
}

export async function sendWhatsAppButtons(to, { body, buttons = [] }, config) {
  return graphPost(config, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: String(body || "").slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: String(b.title).slice(0, 20) } })),
      },
    },
  });
}

export async function markWhatsAppRead(messageId, config) {
  try {
    await graphPost(config, { messaging_product: "whatsapp", status: "read", message_id: messageId });
  } catch (error) {
    console.warn("WhatsApp mark-as-read failed:", error?.message);
  }
}