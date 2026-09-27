import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Profile } from "@/db/schema";
import { signOut } from "@/server/auth/actions";

const NAV: Record<Profile["role"], { href: string; label: string }[]> = {
  client: [{ href: "/client", label: "Orders" }],
  engineer: [
    { href: "/engineer", label: "Dashboard" },
    { href: "/engineer/profile", label: "Profile" },
    { href: "/engineer/services", label: "Services" },
  ],
};

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <span className="font-semibold">Mixdrop</span>
          {NAV[profile.role].map((item) => (
            <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {profile.displayName} · {profile.role}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
