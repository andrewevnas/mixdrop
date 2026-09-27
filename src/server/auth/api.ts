import "server-only";

import { NextResponse } from "next/server";

import type { Profile } from "@/db/schema";
import { getProfile } from "@/server/data/profiles";

import { getCurrentUser } from "./session";

export type ApiCaller = { userId: string; profile: Profile };

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Auth for JSON route handlers: returns the verified caller, or a 401/403/415 response.
 * Requiring a JSON content type means a cross-site HTML form can't trigger these endpoints
 * (that would need a CORS preflight, which we never grant).
 */
export async function apiCaller(request: Request): Promise<ApiCaller | NextResponse> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return jsonError(415, "Expected application/json");
  }
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not signed in");
  const profile = await getProfile(user.id);
  if (!profile) return jsonError(403, "Finish setting up your account");
  return { userId: user.id, profile };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
