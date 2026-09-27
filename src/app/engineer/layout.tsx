import { AppShell } from "@/components/app/app-shell";
import { requireRole } from "@/server/auth/session";

// Guards the shell for /engineer. Each page must ALSO call requireRole("engineer"):
// layouts are skipped on client-side navigation, so they can't be the only check.
export default async function EngineerLayout({ children }: LayoutProps<"/engineer">) {
  const { profile } = await requireRole("engineer");
  return <AppShell profile={profile}>{children}</AppShell>;
}
