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
        providerProfile = await findProviderProfileByUserId(dbUser.id);
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
  } catch {
    return null;
  }

  // 2. No user found by Clerk ID — try matching by email
  if (clerkUser.email) {
    try {
      const existing = await findUserByEmail(clerkUser.email);
      if (existing) {
        let providerProfile = null;
        if (existing.role === "venue_host" || existing.role === "shortlet_host") {
          providerProfile = await findProviderProfileByUserId(existing.id);
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
    } catch {
      return null;
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
    // 4. Race condition — try fetching by email one more time
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
    return null;
  }
}
