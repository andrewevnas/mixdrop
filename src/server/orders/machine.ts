import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { type Order, orderEvents, orders, type OrderStatus } from "@/db/schema";

import { type Actor, type Effect, planTransition } from "./rules";

export { GuardError, IllegalTransitionError } from "./rules";

/** The order doesn't exist, or the actor isn't its client/engineer (indistinguishable on purpose). */
export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
  }
}

/**
 * The ONLY way to change orders.status. In one transaction: lock the order, check the actor is
 * a participant, validate against the rules table, apply the patch, and write an order_events row.
 * `actor` must come from the verified session (or be { kind: "system" } for webhooks/jobs).
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  opts: { note?: string; now?: Date } = {},
): Promise<{ order: Order; effects: Effect[] }> {
  const now = opts.now ?? new Date();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new OrderNotFoundError();
    if (actor.kind === "client" && order.clientId !== actor.userId) throw new OrderNotFoundError();
    // Engineers can't see unpaid drafts, so they can't act on them either.
    if (actor.kind === "engineer" && (order.engineerId !== actor.userId || order.status === "draft")) {
      throw new OrderNotFoundError();
    }

    // Phase 5 replaces this with a count of the order's deliveries.
    const deliveryCount = 0;
    const plan = planTransition(order, to, actor, { now, note: opts.note, deliveryCount });

    // `status = from` is belt-and-braces on top of the row lock.
    const [updated] = await tx
      .update(orders)
      .set({ ...plan.patch, updatedAt: now })
      .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
      .returning();
    if (!updated) throw new Error("Order changed during transition");

    await tx.insert(orderEvents).values({ orderId, ...plan.event, createdAt: now });
    return { order: updated, effects: plan.effects };
  });
}
