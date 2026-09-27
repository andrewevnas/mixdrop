import { Button } from "@/components/ui/button";
import type { Profile } from "@/db/schema";
import { signOut } from "@/server/auth/actions";

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Mixdrop</span>
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
