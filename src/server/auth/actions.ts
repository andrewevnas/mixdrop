"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { appUrl } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProfile, getProfile } from "@/server/data/profiles";

import { dashboardPathFor } from "./roles";
import { loginSchema, onboardingSchema, signupSchema } from "./schemas";
import { requireUser } from "./session";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
};

// Fixed messages for known Supabase errors; never echo raw auth errors (they can leak account state).
const SIGNUP_ERRORS: Record<string, string> = {
  weak_password: "Choose a stronger password.",
  over_email_send_rate_limit: "Too many attempts. Try again in a few minutes.",
  over_request_rate_limit: "Too many attempts. Try again in a few minutes.",
};

function fieldErrors(error: z.ZodError): FormState {
  return { fieldErrors: z.flattenError(error).fieldErrors };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email, password, displayName, role } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback`,
      // Hint only; the profile row created on confirmation is the source of truth.
      data: { role, display_name: displayName },
    },
  });
  if (error) {
    return { error: SIGNUP_ERRORS[error.code ?? ""] ?? "Couldn't create the account. Try again." };
  }

  return { message: "Check your email for a confirmation link." };
}

export async function logIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first — check your inbox." };
    }
    return { error: "Invalid email or password." };
  }

  const profile = await getProfile(data.user.id);
  redirect(profile ? dashboardPathFor(profile.role) : "/onboarding");
}

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  // Insert-only: if a profile already exists its role is kept.
  const profile = await createProfile(user.id, parsed.data);
  redirect(dashboardPathFor(profile.role));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
