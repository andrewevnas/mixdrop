import { type NextRequest, NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPathFor } from "@/server/auth/roles";
import { ensureProfileFromSignupHint } from "@/server/auth/session";

// Email confirmation (and later OAuth) lands here with a PKCE code.
// Redirect targets are fixed paths, never taken from the query string.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, appUrl()));

  if (!code) return to("/login?error=link");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=link");

  const profile = await ensureProfileFromSignupHint(data.user);
  return to(profile ? dashboardPathFor(profile.role) : "/onboarding");
}
