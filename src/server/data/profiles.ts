import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { type Profile, profiles } from "@/db/schema";
import type { OnboardingInput } from "@/server/auth/schemas";

// `userId` must come from the verified session (src/server/auth/session.ts), never the client.

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return row ?? null;
}

/**
 * Create the caller's profile. Insert-only: if one already exists it is returned unchanged,
 * so a role can never be switched after the fact.
 */
export async function createProfile(userId: string, input: OnboardingInput): Promise<Profile> {
  await db
    .insert(profiles)
    .values({ id: userId, role: input.role, displayName: input.displayName })
    .onConflictDoNothing({ target: profiles.id });
  const profile = await getProfile(userId);
  if (!profile) throw new Error("Profile insert failed");
  return profile;
}
