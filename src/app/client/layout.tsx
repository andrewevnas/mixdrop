import { AppShell } from "@/components/app/app-shell";
import { requireRole } from "@/server/auth/session";

// Guards the shell for /client. Each page must ALSO call requireRole("client"):
// layouts are skipped on client-side navigation, so they can't be the only check.
export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const { profile } = await requireRole("client");
  return <AppShell profile={profile}>{children}</AppShell>;
}
