import type { Profile, Role } from "@/db/schema";

export const ROLES = ["client", "engineer"] as const satisfies readonly Role[];

export type AuthzResult =
  | { kind: "ok"; profile: Profile }
  | { kind: "no-profile" }
  | { kind: "forbidden" };

/** Decide whether a signed-in user's profile may access an area requiring `required`. */
export function authorize(profile: Profile | null, required: Role | "any"): AuthzResult {
  if (!profile) return { kind: "no-profile" };
  if (required !== "any" && profile.role !== required) return { kind: "forbidden" };
  return { kind: "ok", profile };
}

export function dashboardPathFor(role: Role): "/client" | "/engineer" {
  return role === "engineer" ? "/engineer" : "/client";
}
