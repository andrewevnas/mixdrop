import { z } from "zod";

import { ROLES } from "./roles";

const email = z.string().trim().toLowerCase().pipe(z.email());
// bcrypt (used by Supabase Auth) ignores bytes past 72.
const password = z.string().min(8, "At least 8 characters").max(72, "At most 72 characters");
const displayName = z.string().trim().min(1, "Required").max(60, "At most 60 characters");
const role = z.enum(ROLES);

export const signupSchema = z.object({ email, password, displayName, role });
export const loginSchema = z.object({ email, password: z.string().min(1, "Required").max(72) });
export const onboardingSchema = z.object({ displayName, role });

/**
 * Role/name chosen at signup, stashed in Supabase user_metadata until the profile exists.
 * Users can edit their own metadata, so this is only ever a hint for creating the profile
 * once — never a source of truth for authorization.
 */
export const signupHintSchema = z.object({ role, display_name: displayName });

export type SignupInput = z.infer<typeof signupSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
