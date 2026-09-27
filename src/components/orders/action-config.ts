import type { Order, OrderStatus } from "@/db/schema";
import { availableTransitions } from "@/server/orders/rules";

import type { OrderActionButton } from "./order-actions";

type Role = "client" | "engineer";

function buttonFor(role: Role, to: OrderStatus, order: Order): OrderActionButton | null {
  if (role === "client") {
    switch (to) {
      case "approved":
        return {
          to,
          label: "Approve final mix",
          confirm: "Approve this delivery? Final files unlock and the engineer gets paid. This can't be undone.",
        };
      case "revision_requested": {
        const left = order.revisionsIncluded - order.revisionCount;
        return left > 0
          ? { to, label: `Request revision (${left} left)`, variant: "outline", noteLabel: "What should change?" }
          : null;
      }
      case "refunded":
        return { to, label: "Get a full refund", variant: "destructive", confirm: "Cancel this order and get a full refund?" };
    }
  } else {
    switch (to) {
      case "accepted":
        return { to, label: "Accept order" };
      case "declined":
        return { to, label: "Decline", variant: "destructive", confirm: "Decline this order? The client is refunded in full." };
      case "in_progress":
        return { to, label: order.status === "revision_requested" ? "Resume work" : "Start work" };
      case "delivered":
        // Phase 5 adds uploads; the rules already require >= 1 delivery.
        return { to, label: "Mark delivered", disabledReason: "Upload a delivery first (coming soon)." };
    }
  }
  return null;
}

/** Buttons for what this role may do next on this order (the server re-checks everything). */
export function actionsFor(role: Role, order: Order): OrderActionButton[] {
  return availableTransitions(order.status, role)
    .map((to) => buttonFor(role, to, order))
    .filter((b): b is OrderActionButton => b !== null);
}
