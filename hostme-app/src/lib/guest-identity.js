import crypto from "crypto";
import { parseSessionToken, verifyClerkSession } from "./getSessionUser.js";
import { getUser } from "./getUser.js";
import { supabase } from "./supabase.js";
import { signGuestToken, verifyGuestToken, readGuestToken, guestCookie } from "./guest-token.js";

function guestClerkId(sub) {
  return `guest_${sub}`;
}

function guestEmail(sub) {
  return `guest_${sub}@guest.hostme.local`;
}

async function findUserByGuestId(sub) {
  const { data } = await supabase.from("users").select().eq("clerk_id", guestClerkId(sub)).maybeSingle();
  return data;
}

async function createGuestUser(sub) {
  const { data } = await supabase.from("users").insert({
    clerk_id: guestClerkId(sub),
    name: `Guest ${sub.slice(0, 4).toUpperCase()}`,
    email: guestEmail(sub),
    roles: ["guest"],
    active_role: "guest",
    status: "active",
  }).select().single();
  return data;
}

async function getOrCreateGuestUser(sub) {
  let user = await findUserByGuestId(sub);
  if (user) return user;
  try {
    user = await createGuestUser(sub);
  } catch {
    user = await findUserByGuestId(sub);
  }
  return user;
}

export async function issueGuest() {
  const sub = crypto.randomUUID();
  const user = await getOrCreateGuestUser(sub);
  if (!user) throw new Error("Could not create guest identity");
  const token = signGuestToken({ sub });
  return { user, token, cookie: guestCookie(token) };
}

export async function resolveActor(request) {
  const session = parseSessionToken(request);
  if (session?.userId) {
    const isValid = await verifyClerkSession(session.sessionId, session.userId);
    if (isValid) {
      const user = await getUser(session.userId);
      if (user) return { type: "clerk", user };
    }
  }

  const token = readGuestToken(request);
  if (token) {
    const payload = verifyGuestToken(token);
    if (payload?.sub) {
      const user = await getOrCreateGuestUser(payload.sub);
      if (user) return { type: "guest", user, token };
    }
  }
  return null;
}

export function okWithGuestCookie(data, status, cookie) {
  return Response.json(data, { status, headers: { "Set-Cookie": cookie } });
}
