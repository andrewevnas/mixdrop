import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { ServiceSummary } from "@/components/engineer/service-summary";
import { buttonVariants } from "@/components/ui/button";
import { getPublicEngineer } from "@/server/data/engineers";
import { slugSchema } from "@/server/engineers/schemas";

// Public, no auth. Rendered per request so price and visibility changes show immediately.
const load = cache(async (rawSlug: string) => {
  const slug = slugSchema.safeParse(rawSlug);
  return slug.success ? getPublicEngineer(slug.data) : null;
});

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const engineer = await load((await params).slug);
  if (!engineer) return { title: "Engineer not found · Mixdrop" };
  return {
    title: `${engineer.displayName} · Mixdrop`,
    description: engineer.bio.slice(0, 160) || `Mixing and mastering by ${engineer.displayName}.`,
  };
}

export default async function EngineerPublicPage({ params }: PageProps<"/e/[slug]">) {
  await connection();
  const engineer = await load((await params).slug);
  if (!engineer) notFound();

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 p-4 py-10">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{engineer.displayName}</h1>
        {engineer.genres.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {engineer.genres.map((g) => (
              <li key={g} className="bg-muted rounded-full px-3 py-1 text-xs">
                {g}
              </li>
            ))}
          </ul>
        )}
        {engineer.bio && <p className="text-muted-foreground whitespace-pre-line">{engineer.bio}</p>}
      </header>
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">Services</h2>
        {engineer.services.length === 0 ? (
          <p className="text-muted-foreground">No services available right now.</p>
        ) : (
          <ul className="grid gap-3">
            {engineer.services.map((s) => (
              <li key={s.id} data-testid="public-service" className="grid gap-3 rounded-lg border p-4">
                <ServiceSummary service={s} />
                <Link
                  href={`/client/orders/new?service=${s.id}`}
                  className={buttonVariants({ size: "sm", className: "justify-self-start" })}
                >
                  Order
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
