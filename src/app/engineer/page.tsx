import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/server/auth/session";
import { getOwnEngineerProfile, listOwnServices } from "@/server/data/engineers";

export default async function EngineerDashboard() {
  // Checked here as well as in the layout: layouts don't re-run on client navigation.
  const { user } = await requireRole("engineer");
  const profile = await getOwnEngineerProfile(user.id);
  const activeCount = profile ? (await listOwnServices(user.id)).filter((s) => s.active).length : 0;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Engineer dashboard</h1>
      {!profile ? (
        <section className="grid gap-3 rounded-lg border p-4">
          <p>Set up your public profile so artists can find and book you.</p>
          <Link href="/engineer/profile" className={buttonVariants({ className: "justify-self-start" })}>
            Set up your profile
          </Link>
        </section>
      ) : (
        <section className="grid gap-2 rounded-lg border p-4">
          <p>
            Your public page:{" "}
            <Link href={`/e/${profile.slug}`} className="underline">
              /e/{profile.slug}
            </Link>
          </p>
          <p className="text-muted-foreground text-sm">
            {activeCount} active service{activeCount === 1 ? "" : "s"} ·{" "}
            <Link href="/engineer/services" className="underline">
              manage services
            </Link>
          </p>
        </section>
      )}
      <p className="text-muted-foreground">No incoming orders yet.</p>
    </div>
  );
}
