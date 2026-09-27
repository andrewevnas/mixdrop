import Link from "next/link";

import { formatPrice } from "@/lib/money";
import type { OrderDetail } from "@/server/data/orders";

import { StatusBadge } from "./labels";

export function OrdersList({
  orders,
  basePath,
  counterpart,
  empty,
}: {
  orders: OrderDetail[];
  basePath: "/client/orders" | "/engineer/orders";
  counterpart: "engineer" | "client";
  empty: React.ReactNode;
}) {
  if (orders.length === 0) return <div className="text-muted-foreground">{empty}</div>;
  return (
    <ul className="grid gap-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={`${basePath}/${o.id}`}
            data-testid="order-row"
            className="hover:bg-muted/50 grid gap-1 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <span className="grid gap-0.5">
              <span className="font-medium">
                {o.songTitle} <span className="text-muted-foreground font-normal">— {o.artistName}</span>
              </span>
              <span className="text-muted-foreground text-sm">
                {o.serviceName} · {counterpart === "engineer" ? o.engineerName : o.clientName} ·{" "}
                {formatPrice(o.pricePence, o.currency)}
              </span>
            </span>
            <StatusBadge status={o.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
