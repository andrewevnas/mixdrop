import Link from "next/link";
import { z } from "zod";

import { ServiceSummary } from "@/components/engineer/service-summary";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { requireRole } from "@/server/auth/session";
import { getOrderableService } from "@/server/data/engineers";

export default async function NewOrderPage({ searchParams }: PageProps<"/client/orders/new">) {
  await requireRole("client");
  const serviceId = z.uuid().safeParse((await searchParams).service);
  const service = serviceId.success ? await getOrderableService(serviceId.data) : null;

  if (!service) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">New order</h1>
        <p>That service isn&apos;t available. Pick one from an engineer&apos;s page.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">New order</h1>
        <p className="text-muted-foreground text-sm">
          with{" "}
          <Link href={`/e/${service.engineerSlug}`} className="underline">
            {service.engineerName}
          </Link>
        </p>
      </div>
      <div className="max-w-xl rounded-lg border p-4">
        <ServiceSummary service={service} />
      </div>
      <NewOrderForm serviceId={service.id} pricePence={service.pricePence} />
    </div>
  );
}
