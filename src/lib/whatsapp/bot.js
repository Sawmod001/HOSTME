const STOP_WORDS = new Set([
  "i", "we", "you", "a", "an", "the", "please", "to", "for", "at", "on", "in",
  "around", "near", "of", "with", "under", "over", "show", "me", "some", "find",
  "search", "book", "booked", "bookings", "venue", "venues", "space", "spaces",
  "place", "places", "available", "availability", "looking", "want", "need",
  "where", "list", "listing", "listings", "up", "and", "or", "is", "there",
  "any", "anywhere",
]);

const SEARCH_HINTS = [
  "find", "search", "venue", "venues", "space", "spaces", "place", "places",
  "show", "book", "available", "where",
];

const SELECTION_HINTS = [/^select\s+\d+/i, /^(choice|option|number)\s+\d+/i];

const KNOWN_AREAS = [
  "Lekki Phase 1", "Victoria Island", "Eko Atlantic", "Lekki", "Ikoyi", "Ajah",
  "Yaba", "Surulere", "Ikeja", "Alausa", "Opebi", "Allen", "Ogba", "Magodo",
  "Gbagada", "Anthony", "Maryland", "Egbeda", "Ipaja", "Isheri", "Lagos Island",
  "Mainland", "Ilorin", "Lagos",
];

const ACK_WORDS = new Set([
  "ok", "okay", "k", "thanks", "thank", "thx", "cool", "nice", "great", "good",
  "sure", "yes", "no", "lol", "fine", "alright", "yep", "nope", "babe", "dear",
]);

// When these appear in a search, the plain template isn't enough — ask the AI.
const COMPARISON_HINTS = [
  "cheap", "cheapest", "expensive", "best", "recommend", "affordable", "budget",
  "compare", "worth", "price", "prices",
];

// Free-form questions with a fixed answer — no AI call needed.
const ABOUT_HINTS = [
  "what is clockhost", "about clockhost", "about the app", "what do you do", "who are you",
  "how does clockhost work", "what is clock host", "whats clockhost", "what's clockhost",
  "what's host me", "what is the app", "tell me about clockhost", "tell me about the app",
];

const GROUP_BOOKING_HINTS = [
  "group booking", "group bookings", "group book", "book as a group",
  "split cost", "split the cost", "split the bill", "split payment", "pay in parts",
  "multiple people", "share the bill", "collect from friends", "everyone pays",
];

export const MENU_TEXT = [
  "ClockHost WhatsApp desk is on. Try:",
  '"find a venue in Ikeja"',
  '"search spaces in Lagos"',
  '"show venues in Lekki"',
  "",
  "I'll reply with venues and live availability. Reply \"menu\" to reset.",
].join("\n");

export const MENU_MESSAGE = {
  kind: "buttons",
  body: "ClockHost WhatsApp desk is on.\n\nTap below or just type something like:\n\"find a venue in Ikeja\" or \"cheapest place for 50 people\"",
  buttons: [
    { id: "find_venue", title: "Find a venue" },
    { id: "group_booking", title: "Group booking" },
    { id: "help", title: "Help" },
  ],
};

export const ABOUT_TEXT = `ClockHost is a Nigerian marketplace for booking event venues and spaces.

You can search by area (like Ikeja or Lekki), see live availability and prices, and book by the hour. Hosts manage their own listings and availability.

Bookings are paid in Naira. Reply "menu" to start, or type something like "find a venue in Ikeja".`;

export function groupBookingText({ venue, link }) {
  return [
    `Group booking for ${venue}`,
    "",
    "ClockHost lets a group split one venue booking: one person starts the plan, shares a link, and each friend pays their own share in Naira.",
    "",
    `Create the plan here and share the link: ${link}`,
    "Each friend signs in with their ClockHost account to join and pay their share.",
    "",
    "The plan auto-finalizes when the group fills up. If it doesn't fill by the close date, it cancels and everyone is refunded.",
    "",
    'Reply "menu" to search again.',
  ].join("\n");
}

function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

export function looksLikeSearch(t) {
  return SEARCH_HINTS.some((hint) => t.includes(hint));
}

export function parseIntent(text, state) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return { intent: "menu" };
  if (/^(menu|help|hi|hello|hey|start|reset|cancel|back|done)$/.test(t)) {
    return { intent: "reset" };
  }
  if (state && state.step === "selection") {
    if (/^\d+$/.test(t)) {
      return { intent: "select", index: parseInt(t, 10) };
    }
    if (SELECTION_HINTS.some((re) => re.test(t))) {
      const match = t.match(/\d+/);
      if (match) return { intent: "select", index: parseInt(match[0], 10) };
    }
  }
  if (GROUP_BOOKING_HINTS.some((hint) => t.includes(hint))) {
    return { intent: "group_booking" };
  }
  if (ABOUT_HINTS.some((hint) => t.includes(hint))) {
    return { intent: "about" };
  }
  return { intent: looksLikeSearch(t) ? "search" : "menu" };
}

export function extractArea(text) {
  const source = String(text || "");
  const lower = source.toLowerCase();

  // Known areas match case-insensitively (people rarely capitalise on WhatsApp).
  // Longest names first so "Lekki Phase 1" wins over "Lekki".
  for (const area of KNOWN_AREAS.slice().sort((a, b) => b.length - a.length)) {
    if (lower.includes(area.toLowerCase())) return area;
  }

  const tokens = source.split(/\s+/);
  const candidates = tokens
    .filter((token) => token && !STOP_WORDS.has(token.toLowerCase()))
    .filter((token) => /^([A-Z]|\d)/.test(token))
    .map((token) => token.replace(/[.,!?]/g, ""))
    .filter(Boolean);
  return candidates.join(" ") || null;
}

export function shouldUseGemini(text, parsed) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (parsed?.intent === "reset" || parsed?.intent === "select") return false;
  if (parsed?.intent === "about" || parsed?.intent === "group_booking") return false;
  if (parsed?.intent === "search") {
    if (!extractArea(t)) return true;
    const lower = t.toLowerCase();
    return COMPARISON_HINTS.some((hint) => lower.includes(hint));
  }
  const lower = t.toLowerCase().replace(/[^a-z ]/g, " ").trim();
  if (t.length <= 2 || ACK_WORDS.has(lower)) return false;
  return true;
}

export function formatPrice(kobo) {
  const naira = (Number(kobo) || 0) / 100;
  return "₦" + naira.toLocaleString("en-NG");
}

export function formatSlotTime(iso) {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function freeSlots(slots) {
  const now = Date.now();
  return (slots || [])
    .filter((slot) => Number(slot.booked || 0) < Number(slot.capacity || 0))
    .filter((slot) => new Date(slot.event_start).getTime() >= now)
    .sort((a, b) => new Date(a.event_start) - new Date(b.event_start));
}

export function buildSearchResults(matches) {
  if (!matches.length) return "No active venues found right now. Try another area, or reply \"menu\".";

  const lines = matches.map((entry, i) => {
    const l = entry.listing;
    const open = freeSlots(entry.slots);
    const area = l.location?.cityArea || l.location?.state || "Unknown area";
    const pax = l.operational_rules?.maxCapacity;
    const paxLine = pax ? ` · up to ${pax} pax` : "";
    const freeLine = open.length ? ` · ${open.length} free slot${open.length === 1 ? "" : "s"}` : " · fully booked";
    return `${i + 1}) ${l.title} — ${area}\n   ${formatPrice(l.pricing?.baseRatePerHour)}/hr${paxLine}${freeLine}`;
  });

  return [
    `I found ${matches.length} active venue${matches.length === 1 ? "" : "s"}:`,
    "",
    ...lines,
    "",
    'Reply with a number for full slot details, or "menu" to reset.',
  ].join("\n");
}

// Interactive list message: users tap a venue instead of typing a number.
export function buildSearchListMessage(matches) {
  const rows = matches.slice(0, 10).map((entry, i) => {
    const l = entry.listing;
    const open = freeSlots(entry.slots);
    const area = l.location?.cityArea || l.location?.state || "Unknown area";
    const pax = l.operational_rules?.maxCapacity;
    const bits = [`${formatPrice(l.pricing?.baseRatePerHour)}/hr`];
    if (pax) bits.push(`up to ${pax} pax`);
    bits.push(open.length ? `${open.length} free slot${open.length === 1 ? "" : "s"}` : "fully booked");
    return {
      id: String(i + 1),
      title: truncate(l.title, 24),
      description: truncate(`${area} · ${bits.join(" · ")}`, 72),
    };
  });

  return {
    kind: "list",
    body:
      matches.length === 1
        ? "I found 1 active venue — tap it for availability."
        : `I found ${matches.length} active venues — tap one for availability.`,
    button: "View venues",
    sections: [
      {
        title: "Matching venues",
        rows,
      },
    ],
  };
}

export function buildAvailability(listing, slots) {
  const area = listing.location?.cityArea || listing.location?.state || "Unknown area";
  const pax = listing.operational_rules?.maxCapacity;
  const open = freeSlots(slots);
  const maxPax = listing.operational_rules?.maxCapacity;

  const lines = [
    `${listing.title} — ${area}`,
    `Base rate: ${formatPrice(listing.pricing?.baseRatePerHour)}/hr`,
    `Profile: ${listing.booking_type}${maxPax ? ` · up to ${maxPax} pax` : ""}`,
    "",
  ];

  if (!open.length) {
    lines.push("No free slots coming up.");
  } else {
    lines.push("Free slots:");
    open.slice(0, 4).forEach((slot) => {
      const remaining = Number(slot.capacity || 0) - Number(slot.booked || 0);
      lines.push(`• ${formatSlotTime(slot.event_start)} — ${remaining} of ${slot.capacity} free`);
    });
    if (open.length > 4) lines.push(`...and ${open.length - 4} more`);
  }

  lines.push("");
  lines.push(pax ? `Capacity: up to ${pax} people.` : `Capacity: ${listing.booking_type}.`);
  lines.push('Reply "group booking" to split this with friends.');
  lines.push('Reply "menu" to search again.');

  return lines.map((line) => (line === "" ? " " : line)).join("\n");
}

export async function handleMessage({ phone, text, sessions, deps }) {
  const key = normalizePhone(phone);
  const state = sessions.get(key);
  const parsed = parseIntent(text, state);

  if (parsed.intent === "reset") {
    sessions.delete(key);
    return [MENU_MESSAGE];
  }

  if (parsed.intent === "select") {
    if (!state?.listings) {
      sessions.delete(key);
      return [MENU_MESSAGE];
    }
    const listing = state.listings[parsed.index - 1];
    if (!listing) {
      return [
        { kind: "text", text: 'That one isn\'t in the list. Tap a venue from the list, or reply "menu" to start over.' },
      ];
    }
    const slots = await deps.listSlots(listing.id);
    sessions.set(key, { ...state, step: "details", selectedListing: listing });
    return [
      { kind: "text", text: buildAvailability(listing, slots) },
      { kind: "buttons", body: "What next?", buttons: [
        { id: "group_booking", title: "Start group booking" },
        { id: "find_venue", title: "Find another venue" },
        { id: "menu", title: "Menu" },
      ] },
    ];
  }

  if (parsed.intent === "about") {
    return [{ kind: "text", text: ABOUT_TEXT }];
  }

  if (parsed.intent === "group_booking") {
    return groupBookingReply({ state, deps });
  }

  const area = extractArea(text);
  const isSearch = parsed.intent === "search";

  // Fast path: clear area search -> interactive list, zero AI calls.
  if (isSearch && area) {
    return searchReply({ area, sessions, key, deps });
  }

  // AI path: ambiguous search (no area), price/comparison searches, or free-form questions.
  if (deps.generateReply && shouldUseGemini(text, parsed)) {
    const ai = await geminiReply({ text, area, state, deps });
    if (ai) {
      sessions.set(key, ai.sessionState);
      return ai.replies;
    }
  }

  // Fallbacks (no AI configured, or the AI call failed):
  if (!isSearch) return [MENU_MESSAGE];
  return searchReply({ area: null, sessions, key, deps });
}

function groupBookingReply({ state, deps }) {
  const listing = state?.selectedListing;
  if (!listing) {
    return [
      {
        kind: "text",
        text: 'Pick a venue first — find one, tap it to see its slots, then tap "Start group booking" on that venue.',
      },
      { kind: "buttons", body: "Looking for somewhere?", buttons: [{ id: "find_venue", title: "Find a venue" }] },
    ];
  }
  const baseUrl = deps.baseUrl || "http://localhost:3000";
  const link = `${baseUrl}/group-plans/new?listingId=${listing.id}`;
  return [{ kind: "text", text: groupBookingText({ venue: listing.title, link }) }];
}

async function searchReply({ area, sessions, key, deps }) {
  const listings = await deps.listActiveListings({ area });
  if (!listings.length) {
    sessions.delete(key);
    return [
      {
        kind: "text",
        text: area
          ? `No active venues found in ${area} right now. Try another area, or reply "menu".`
          : 'No active venues found right now. Try another area, or reply "menu".',
      },
    ];
  }

  const top = listings.slice(0, 3);
  const matches = await Promise.all(
    top.map(async (listing) => ({ listing, slots: await deps.listSlots(listing.id) }))
  );
  sessions.set(key, { step: "selection", listings: top });
  return [buildSearchListMessage(matches)];
}

async function geminiReply({ text, area, state, deps }) {
  try {
    let listings = state?.listings;
    if (!Array.isArray(listings) || !listings.length) {
      const all = await deps.listActiveListings({ area });
      listings = all.slice(0, 5);
    }
    if (!listings.length) return null;

    const matches = await Promise.all(
      listings.slice(0, 5).map(async (listing) => ({ listing, slots: await deps.listSlots(listing.id) }))
    );
    const reply = await deps.generateReply({ text, venues: matches });
    if (!reply?.trim()) return null;
    return {
      replies: [{ kind: "text", text: reply }],
      sessionState: { step: "selection", listings: matches.map((match) => match.listing) },
    };
  } catch (error) {
    console.error("[whatsapp-bot] Gemini reply failed:", error?.message || error);
    return null;
  }
}