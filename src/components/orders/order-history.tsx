import type { OrderEvent } from "@/db/schema";

import { STATUS_LABELS } from "./labels";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function OrderHistory({ events }: { events: OrderEvent[] }) {
  return (
    <ol className="grid gap-2 text-sm">
      {events.map((e) => (
        <li key={e.id} className="grid gap-0.5">
          <span>
            <span className="font-medium">{e.fromStatus ? STATUS_LABELS[e.toStatus] : "Order created"}</span>
            <span className="text-muted-foreground"> · {dateFmt.format(e.createdAt)} UTC</span>
          </span>
          {e.note && <span className="text-muted-foreground whitespace-pre-line">“{e.note}”</span>}
        </li>
      ))}
    </ol>
  );
}
