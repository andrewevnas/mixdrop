import { formatPrice } from "@/lib/money";
import type { OrderDetail } from "@/server/data/orders";

import { StatusBadge } from "./labels";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export function OrderSummary({ order, counterpart }: { order: OrderDetail; counterpart: string }) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {order.songTitle} <span className="text-muted-foreground font-normal">— {order.artistName}</span>
        </h1>
        <StatusBadge status={order.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Item label="Service" value={order.serviceName} />
        <Item label="Price" value={formatPrice(order.pricePence, order.currency)} />
        <Item label={counterpart} value={counterpart === "Engineer" ? order.engineerName : order.clientName} />
        <Item label="Revisions" value={`${order.revisionCount} of ${order.revisionsIncluded} used`} />
        <Item label="Turnaround" value={`${order.turnaroundDays} days`} />
        <Item label="Due" value={order.dueAt ? `${dateFmt.format(order.dueAt)} UTC` : "Starts when accepted"} />
        <Item label="Max stems" value={String(order.maxStems)} />
      </dl>
      {(order.brief.notes || order.brief.referenceLinks.length > 0) && (
        <div className="grid gap-2 rounded-lg border p-4 text-sm">
          <h2 className="font-medium">Brief</h2>
          {order.brief.notes && <p className="whitespace-pre-line">{order.brief.notes}</p>}
          {order.brief.referenceLinks.length > 0 && (
            <ul className="grid gap-1">
              {order.brief.referenceLinks.map((href) => (
                <li key={href}>
                  {/* Links were validated as http(s) on input. */}
                  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
                    {href}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
