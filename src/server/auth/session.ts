import "server-only";

import type { User } from "@supabase/supabase-js";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import type { Profile, Role } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProfile, getProfile } from "@/server/data/profiles";

import { authorize } from "./roles";
import { signupHintSchema } from "./schemas";

/** The signed-in user, verified against Supabase Auth (not just the cookie). Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Signed-in user with a profile. `required` role mismatch renders a 403. */
export async function requireRole(required: Role | "any"): Promise<{ user: User; profile: Profile }> {
  const user = await requireUser();
  const result = authorize(await getProfile(user.id), required);
  if (result.kind === "no-profile") redirect("/onboarding");
  if (result.kind === "forbidden") forbidden();
  return { user, profile: result.profile };
}

/** After email confirmation: create the profile from the signup hint if there isn't one yet. */
export async function ensureProfileFromSignupHint(user: User): Promise<Profile | null> {
  const existing = await getProfile(user.id);
  if (existing) return existing;
  const hint = signupHintSchema.safeParse(user.user_metadata);
  if (!hint.success) return null;
  return createProfile(user.id, { role: hint.data.role, displayName: hint.data.display_name });
}
