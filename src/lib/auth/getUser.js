import { getClerkUser } from "@/lib/auth/getSessionUser";
import { findUserByClerkId, createUser, findProviderProfileByUserId } from "@/lib/db/supabase-queries";
import { supabase } from "../db/supabase.js";

async function findUserByEmail(email) {
  const { data, error } = await supabase.from("users").select().eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getUser(clerkUserId) {
  if (!clerkUserId) return null;

  const clerkUser = await getClerkUser(clerkUserId);
  if (!clerkUser) return null;

  // 1. Find existing user by Clerk ID
  try {
    const dbUser = await findUserByClerkId(clerkUserId);
    if (dbUser) {
      // Fetch provider profile if user is a provider
      let providerProfile = null;
      if (dbUser.role === "venue_host" || dbUser.role === "shortlet_host") {
        try {
          providerProfile = await findProviderProfileByUserId(dbUser.id);
        } catch (ppErr) {
          console.warn("getUser: provider profile fetch failed for", dbUser.id, ppErr?.message);
        }
      }

      return {
        ...clerkUser,
        id: dbUser.id,
        role: dbUser.role || clerkUser.role || "guest",
        profile: dbUser.profile || {},
        phone: dbUser.phone || null,
        profile_completed: dbUser.profile_completed,
        providerProfile,
      };
    }
  } catch (dbErr) {
    // Don't swallow DB outages as "user not found" — re-throw as transient so caller can return 503
    // Only return null if it's a clear "not found" (which findUserByClerkId returns data=null, not throws)
    if (dbErr?.code && ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].some(c => dbErr.message?.includes(c))) {
      throw dbErr;
    }
    // For other DB errors, log and continue to email fallback rather than silent null
    console.warn("getUser: findUserByClerkId failed", dbErr?.message);
  }

  // 2. No user found by Clerk ID — try matching by email
  if (clerkUser.email) {
    try {
      const existing = await findUserByEmail(clerkUser.email);
      if (existing) {
        let providerProfile = null;
        if (existing.role === "venue_host" || existing.role === "shortlet_host") {
          try {
            providerProfile = await findProviderProfileByUserId(existing.id);
          } catch (ppErr) {
            console.warn("getUser: provider profile fetch failed for email match", existing.id, ppErr?.message);
          }
        }

        return {
          ...clerkUser,
          id: existing.id,
          role: existing.role || clerkUser.role || "guest",
          profile: existing.profile || {},
          phone: existing.phone || null,
          profile_completed: existing.profile_completed,
          providerProfile,
        };
      }
    } catch (emailErr) {
      if (emailErr?.code && ["ECONNREFUSED", "ETIMEDOUT"].some(c => emailErr.message?.includes(c))) throw emailErr;
      console.warn("getUser: findUserByEmail failed", emailErr?.message);
    }
  }

  // 3. No existing user — create new one
  try {
    const dbUser = await createUser({
      clerk_id: clerkUserId,
      name: clerkUser.name,
      email: clerkUser.email,
      role: clerkUser.role || "guest",
      is_email_verified: true,
      email_verified_at: new Date().toISOString(),
      status: "active",
      profile_completed: clerkUser.profileCompleted,
    });
    return {
      ...clerkUser,
      id: dbUser.id,
      role: dbUser.role || "guest",
      profile: dbUser.profile || {},
      phone: dbUser.phone || null,
      profile_completed: dbUser.profile_completed,
      providerProfile: null,
    };
  } catch (createErr) {
    // If creation failed due to unique violation, it's a race — fetch by email
    if (createErr?.code === "23505" || createErr?.message?.includes("duplicate")) {
      if (clerkUser.email) {
        try {
          const existing = await findUserByEmail(clerkUser.email);
          if (existing) {
            return {
              ...clerkUser,
              id: existing.id,
              role: existing.role || clerkUser.role || "guest",
              profile: existing.profile || {},
              phone: existing.phone || null,
              profile_completed: existing.profile_completed,
              providerProfile: null,
            };
          }
        } catch {}
      }
    }
    // For transient DB errors, throw so caller returns 503 not silent null
    if (createErr?.message && /ECONN|ETIMEDOUT|ENOTFOUND|timeout/i.test(createErr.message)) {
      throw createErr;
    }
    console.error("getUser: createUser failed", createErr?.message);
    return null;
  }
}
