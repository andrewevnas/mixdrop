// Order state machine rules — the single source of truth for docs/order-state-machine.md.
// Pure: no DB, no clock. transitionOrder() in ./machine.ts is the only code that applies them.

import type { Order, OrderStatus } from "@/db/schema";

export type ActorKind = "client" | "engineer" | "system";
export type Actor = { kind: "client" | "engineer"; userId: string } | { kind: "system" };

/** Side effects for later phases to dispatch (email in Phase 7, Stripe in Phase 6). Data only. */
export type Effect =
  | "notify_client"
  | "notify_engineer"
  | "refund_full"
  | "unlock_downloads"
  | "schedule_payout"
  | "cancel_transfer";

export type MachineOrder = Pick<
  Order,
  "status" | "revisionCount" | "revisionsIncluded" | "turnaroundDays" | "paidAt" | "dueAt" | "deliveredAt"
>;

export type TransitionContext = {
  now: Date;
  /** Free-text note; required for revision requests. */
  note?: string;
  /** Delivery versions uploaded so far (Phase 5). */
  deliveryCount?: number;
};

export const AUTO_APPROVE_DAYS = 7;
export const REFUND_GRACE_DAYS = 10;
export const MAX_NOTE_LENGTH = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/**
 * When the client may claim a refund: 10 days after the due date. If the engineer never
 * accepted, the due date is taken as paid_at + the ordered turnaround.
 */
export function refundEligibleAfter(order: MachineOrder): Date | null {
  const due = order.dueAt ?? (order.paidAt ? addDays(order.paidAt, order.turnaroundDays) : null);
  return due ? addDays(due, REFUND_GRACE_DAYS) : null;
}

type Patch = Partial<Pick<Order, "paidAt" | "acceptedAt" | "dueAt" | "deliveredAt" | "approvedAt" | "revisionCount">>;

type TransitionDef = {
  from: OrderStatus;
  to: OrderStatus;
  who: ActorKind;
  /** Returns a user-facing reason when the transition isn't allowed right now. */
  guard?: (order: MachineOrder, ctx: TransitionContext) => string | null;
  patch?: (order: MachineOrder, ctx: TransitionContext) => Patch;
  effects: Effect[];
};

const approvePatch = (_o: MachineOrder, { now }: TransitionContext): Patch => ({ approvedAt: now });
const refundEligibleGuard = (o: MachineOrder, { now }: TransitionContext) => {
  const after = refundEligibleAfter(o);
  return after && now > after ? null : "Order isn't overdue enough for a refund yet.";
};

export const TRANSITIONS: readonly TransitionDef[] = [
  {
    from: "draft",
    to: "paid",
    who: "system",
    patch: (_o, { now }) => ({ paidAt: now }),
    effects: ["notify_engineer"],
  },
  {
    from: "paid",
    to: "accepted",
    who: "engineer",
    patch: (o, { now }) => ({ acceptedAt: now, dueAt: addDays(now, o.turnaroundDays) }),
    effects: ["notify_client"],
  },
  { from: "paid", to: "declined", who: "engineer", effects: ["refund_full", "notify_client"] },
  { from: "accepted", to: "in_progress", who: "engineer", effects: ["notify_client"] },
  {
    from: "in_progress",
    to: "delivered",
    who: "engineer",
    guard: (_o, ctx) => ((ctx.deliveryCount ?? 0) >= 1 ? null : "Upload a delivery first."),
    patch: (_o, { now }) => ({ deliveredAt: now }),
    effects: ["notify_client"],
  },
  {
    from: "delivered",
    to: "revision_requested",
    who: "client",
    guard: (o, ctx) => {
      if (!ctx.note?.trim()) return "Describe what you'd like changed.";
      if (o.revisionCount >= o.revisionsIncluded) return "No revisions left on this order.";
      return null;
    },
    patch: (o) => ({ revisionCount: o.revisionCount + 1 }),
    effects: ["notify_engineer"],
  },
  { from: "revision_requested", to: "in_progress", who: "engineer", effects: [] },
  {
    from: "delivered",
    to: "approved",
    who: "client",
    patch: approvePatch,
    effects: ["unlock_downloads", "schedule_payout", "notify_engineer"],
  },
  {
    from: "delivered",
    to: "approved",
    who: "system",
    guard: (o, { now }) =>
      o.deliveredAt && now > addDays(o.deliveredAt, AUTO_APPROVE_DAYS)
        ? null
        : "Auto-approval window hasn't passed.",
    patch: approvePatch,
    effects: ["unlock_downloads", "schedule_payout", "notify_engineer", "notify_client"],
  },
  ...(["paid", "accepted", "in_progress"] as const).map(
    (from): TransitionDef => ({
      from,
      to: "refund_eligible",
      who: "system",
      guard: refundEligibleGuard,
      effects: ["notify_client"],
    }),
  ),
  {
    from: "refund_eligible",
    to: "refunded",
    who: "client",
    effects: ["refund_full", "cancel_transfer", "notify_engineer"],
  },
  { from: "approved", to: "completed", who: "system", effects: [] },
];

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly who: ActorKind,
  ) {
    super(`Illegal order transition ${from} → ${to} by ${who}`);
  }
}

export class GuardError extends Error {}

export type TransitionPlan = {
  patch: Patch & { status: OrderStatus };
  event: { fromStatus: OrderStatus; toStatus: OrderStatus; actorId: string | null; note: string | null };
  effects: Effect[];
};

export function findTransition(from: OrderStatus, to: OrderStatus, who: ActorKind) {
  return TRANSITIONS.find((t) => t.from === from && t.to === to && t.who === who);
}

/** Targets `who` may move an order to from `status` (ignoring guards). For showing buttons. */
export function availableTransitions(status: OrderStatus, who: ActorKind): OrderStatus[] {
  return TRANSITIONS.filter((t) => t.from === status && t.who === who).map((t) => t.to);
}

/**
 * Validate a transition and compute its effect. Throws IllegalTransitionError for anything not
 * in the table and GuardError when a listed transition's precondition fails. Does NOT check
 * that the actor is a participant of the order — transitionOrder() does that.
 */
export function planTransition(
  order: MachineOrder,
  to: OrderStatus,
  actor: Actor,
  ctx: TransitionContext,
): TransitionPlan {
  const def = findTransition(order.status, to, actor.kind);
  if (!def) throw new IllegalTransitionError(order.status, to, actor.kind);

  const note = ctx.note?.trim() ? ctx.note.trim() : null;
  if (note && note.length > MAX_NOTE_LENGTH) throw new GuardError("Note is too long.");
  const reason = def.guard?.(order, ctx);
  if (reason) throw new GuardError(reason);

  return {
    patch: { ...def.patch?.(order, ctx), status: to },
    event: {
      fromStatus: order.status,
      toStatus: to,
      actorId: actor.kind === "system" ? null : actor.userId,
      note,
    },
    effects: [...def.effects],
  };
}
