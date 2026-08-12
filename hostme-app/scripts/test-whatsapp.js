// WhatsApp Cloud API credential + connectivity check.
//
//   node scripts/test-whatsapp.js                    # verify token + phone number ID only
//   node scripts/test-whatsapp.js +2349169651878     # also send a test text to that number
//
// The recipient must be on the WhatsApp allow-list (dev/test mode) or have
// messaged the business number within the 24h window, or Meta rejects the send.
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), file), "utf-8");
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
      }
    } catch {}
  }
}

const GRAPH_URL = "https://graph.facebook.com/v25.0";
loadEnv();

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!token || !phoneNumberId) {
  console.error("Missing WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID in .env or .env.local");
  process.exit(1);
}

const infoRes = await fetch(`${GRAPH_URL}/${phoneNumberId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log(`GET /${phoneNumberId} ->`, infoRes.status);
if (infoRes.ok) {
  const info = await infoRes.json();
  console.log("  display phone :", info.display_phone_number);
  console.log("  verified name :", info.verified_name);
  console.log("  quality rating:", info.quality_rating);
} else {
  console.log("  ", (await infoRes.text()).slice(0, 400));
  process.exit(1);
}

const recipient = process.argv[2];
if (!recipient) {
  console.log('\nCredentials OK. To send a live test message:\n  node scripts/test-whatsapp.js +234XXXXXXXXXX');
  return;
}

const sendRes = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient.replace(/[^\d]/g, ""),
    type: "text",
    text: { body: "Hi from HostMe! Your WhatsApp venue assistant is online. Try: find a venue in Ikeja" },
  }),
});

console.log("POST /messages ->", sendRes.status);
console.log((await sendRes.text()).slice(0, 500));
if (!sendRes.ok) process.exit(1);