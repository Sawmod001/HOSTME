import { getClerkUser } from "@/lib/getSessionUser";
import { findUserByClerkId, createUser } from "@/lib/supabase-queries";
import { supabase } from "./supabase.js";

async function findUserByEmail(email) {
  const { data, error } = await supabase.from("users").select().eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMongoUser(clerkUserId) {
  if (!clerkUserId) return null;

  const clerkUser = await getClerkUser(clerkUserId);
  if (!clerkUser) return null;

  // 1. Find existing user by Clerk ID
  try {
    const dbUser = await findUserByClerkId(clerkUserId);
    if (dbUser) {
      return {
        ...clerkUser,
        id: dbUser.id,
        profile: dbUser.profile || {},
        phone: dbUser.phone || null,
        profile_completed: dbUser.profile_completed,
      };
    }
  } catch {
    // DB might be down — can't look up or create
    return null;
  }

  // 2. No user found by Clerk ID — try matching by email (in case Clerk ID changed)
  if (clerkUser.email) {
    try {
      const existing = await findUserByEmail(clerkUser.email);
      if (existing) {
        return {
          ...clerkUser,
          id: existing.id,
          profile: existing.profile || {},
          phone: existing.phone || null,
          profile_completed: existing.profile_completed,
        };
      }
    } catch {
      // DB issue — can't proceed
      return null;
    }
  }

  // 3. No existing user at all — create a new one
  try {
    const dbUser = await createUser({
      clerk_id: clerkUserId,
      name: clerkUser.name,
      email: clerkUser.email,
      roles: clerkUser.roles,
      active_role: clerkUser.activeRole,
      is_email_verified: true,
      email_verified_at: new Date().toISOString(),
      status: "active",
      profile_completed: clerkUser.profileCompleted,
    });
    return {
      ...clerkUser,
      id: dbUser.id,
      profile: dbUser.profile || {},
      phone: dbUser.phone || null,
      profile_completed: dbUser.profile_completed,
    };
  } catch (createErr) {
    // 4. Create failed — maybe a race condition; try fetching by email one more time
    if (clerkUser.email) {
      try {
        const existing = await findUserByEmail(clerkUser.email);
        if (existing) {
          return {
            ...clerkUser,
            id: existing.id,
            profile: existing.profile || {},
            phone: existing.phone || null,
            profile_completed: existing.profile_completed,
          };
        }
      } catch {}
    }
    return null;
  }
}