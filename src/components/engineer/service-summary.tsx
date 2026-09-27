import { formatPrice } from "@/lib/money";
import type { PublicService } from "@/server/data/engineers";
import { SERVICE_TYPE_LABELS } from "@/server/engineers/schemas";

export function ServiceSummary({ service }: { service: PublicService }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium">{service.name}</h3>
        <span className="font-semibold">{formatPrice(service.pricePence, service.currency)}</span>
      </div>
      <p className="text-muted-foreground text-sm">
        {SERVICE_TYPE_LABELS[service.type]} · {service.turnaroundDays}-day turnaround ·{" "}
        {service.revisionsIncluded} revision{service.revisionsIncluded === 1 ? "" : "s"} · up to{" "}
        {service.maxStems} stems
      </p>
    </div>
  );
}
