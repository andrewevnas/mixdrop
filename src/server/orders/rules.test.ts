import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ORDER_STATUSES, type OrderStatus } from "@/db/schema";

import {
  type Actor,
  type ActorKind,
  addDays,
  AUTO_APPROVE_DAYS,
  availableTransitions,
  GuardError,
  IllegalTransitionError,
  type MachineOrder,
  MAX_NOTE_LENGTH,
  planTransition,
  refundEligibleAfter,
  TRANSITIONS,
  type TransitionContext,
} from "./rules";

const ACTORS: Record<ActorKind, Actor> = {
  client: { kind: "client", userId: "client-1" },
  engineer: { kind: "engineer", userId: "engineer-1" },
  system: { kind: "system" },
};

const T0 = new Date("2026-01-01T00:00:00Z");

const order = (overrides: Partial<MachineOrder> = {}): MachineOrder => ({
  status: "draft",
  revisionCount: 0,
  revisionsIncluded: 2,
  turnaroundDays: 7,
  paidAt: null,
  dueAt: null,
  deliveredAt: null,
  ...overrides,
});

/** An order + context in which every guard passes, so only legality is being tested. */
const permissive = (status: OrderStatus) => ({
  order: order({ status, paidAt: T0, dueAt: addDays(T0, 7), deliveredAt: T0 }),
  ctx: { now: addDays(T0, 365), note: "Please lift the vocal", deliveryCount: 1 } satisfies TransitionContext,
});

/** Transitions as written in docs/order-state-machine.md ("paid/accepted/in_progress" expanded). */
function transitionsFromDoc(): string[] {
  const doc = readFileSync(join(process.cwd(), "docs/order-state-machine.md"), "utf8");
  return doc
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.includes("---") && !l.includes("From"))
    .flatMap((l) => {
      const [from, to, who] = l.split("|").slice(1, 4).map((c) => c.trim());
      return from.split("/").map((f) => `${f.trim()} → ${to} by ${who}`);
    });
}
const key = (from: string, to: string, who: string) => `${from} → ${to} by ${who}`;

describe("transition table", () => {
  it("matches docs/order-state-machine.md exactly", () => {
    const code = TRANSITIONS.map((t) => key(t.from, t.to, t.who)).sort();
    expect(code).toEqual(transitionsFromDoc().sort());
    expect(code).toHaveLength(14);
  });
});

describe("every (from, to, actor) combination", () => {
  const legal = new Set(TRANSITIONS.map((t) => key(t.from, t.to, t.who)));
  const cases = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.flatMap((to) => (["client", "engineer", "system"] as const).map((who) => ({ from, to, who }))),
  );

  it(`covers all ${ORDER_STATUSES.length ** 2 * 3} combinations`, () => {
    expect(cases).toHaveLength(363);
  });

  it.each(cases.filter((c) => legal.has(key(c.from, c.to, c.who))))(
    "allows $from → $to by $who",
    ({ from, to, who }) => {
      const { order: o, ctx } = permissive(from);
      expect(planTransition(o, to, ACTORS[who], ctx).patch.status).toBe(to);
    },
  );

  it.each(cases.filter((c) => !legal.has(key(c.from, c.to, c.who))))(
    "rejects $from → $to by $who",
    ({ from, to, who }) => {
      const { order: o, ctx } = permissive(from);
      expect(() => planTransition(o, to, ACTORS[who], ctx)).toThrow(IllegalTransitionError);
    },
  );
});

describe("patches and events", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("draft → paid stamps paid_at and is attributed to the system", () => {
    const plan = planTransition(order(), "paid", ACTORS.system, { now });
    expect(plan.patch).toEqual({ status: "paid", paidAt: now });
    expect(plan.event).toEqual({ fromStatus: "draft", toStatus: "paid", actorId: null, note: null });
    expect(plan.effects).toEqual(["notify_engineer"]);
  });

  it("accept starts the deadline clock: due_at = now + turnaround_days", () => {
    const plan = planTransition(order({ status: "paid", turnaroundDays: 5 }), "accepted", ACTORS.engineer, { now });
    expect(plan.patch).toEqual({ status: "accepted", acceptedAt: now, dueAt: new Date("2026-03-15T12:00:00Z") });
    expect(plan.event.actorId).toBe("engineer-1");
    expect(plan.effects).toEqual(["notify_client"]);
  });

  it("decline refunds in full and notifies the client", () => {
    expect(planTransition(order({ status: "paid" }), "declined", ACTORS.engineer, { now }).effects).toEqual([
      "refund_full",
      "notify_client",
    ]);
  });

  it("delivery stamps delivered_at", () => {
    const plan = planTransition(order({ status: "in_progress" }), "delivered", ACTORS.engineer, {
      now,
      deliveryCount: 1,
    });
    expect(plan.patch).toEqual({ status: "delivered", deliveredAt: now });
  });

  it("a revision request increments revision_count and keeps the trimmed note", () => {
    const plan = planTransition(order({ status: "delivered", revisionCount: 1 }), "revision_requested", ACTORS.client, {
      now,
      note: "  More bass  ",
    });
    expect(plan.patch).toEqual({ status: "revision_requested", revisionCount: 2 });
    expect(plan.event.note).toBe("More bass");
    expect(plan.effects).toEqual(["notify_engineer"]);
  });

  it("client approval stamps approved_at, unlocks downloads and schedules payout", () => {
    const plan = planTransition(order({ status: "delivered" }), "approved", ACTORS.client, { now });
    expect(plan.patch).toEqual({ status: "approved", approvedAt: now });
    expect(plan.effects).toEqual(["unlock_downloads", "schedule_payout", "notify_engineer"]);
  });

  it("refund cancels the transfer", () => {
    expect(planTransition(order({ status: "refund_eligible" }), "refunded", ACTORS.client, { now }).effects).toEqual([
      "refund_full",
      "cancel_transfer",
      "notify_engineer",
    ]);
  });

  it("returns a copy of effects, not the table's array", () => {
    const plan = planTransition(order({ status: "approved" }), "completed", ACTORS.system, { now });
    plan.effects.push("notify_client");
    expect(planTransition(order({ status: "approved" }), "completed", ACTORS.system, { now }).effects).toEqual([]);
  });

  it("rejects notes over the limit", () => {
    expect(() =>
      planTransition(order({ status: "paid" }), "declined", ACTORS.engineer, { now, note: "x".repeat(MAX_NOTE_LENGTH + 1) }),
    ).toThrow(GuardError);
  });
});

describe("guards", () => {
  const now = T0;

  describe("delivered requires at least one delivery", () => {
    it.each([undefined, 0])("blocks with deliveryCount=%s", (deliveryCount) => {
      expect(() =>
        planTransition(order({ status: "in_progress" }), "delivered", ACTORS.engineer, { now, deliveryCount }),
      ).toThrow(GuardError);
    });

    it("allows with one delivery", () => {
      expect(() =>
        planTransition(order({ status: "in_progress" }), "delivered", ACTORS.engineer, { now, deliveryCount: 1 }),
      ).not.toThrow();
    });
  });

  describe("revision requests", () => {
    it.each([undefined, "", "   \n "])("require a note (note=%j)", (note) => {
      expect(() =>
        planTransition(order({ status: "delivered" }), "revision_requested", ACTORS.client, { now, note }),
      ).toThrow(/Describe what/);
    });

    it("are allowed while revision_count < revisions_included", () => {
      const o = order({ status: "delivered", revisionCount: 1, revisionsIncluded: 2 });
      expect(() => planTransition(o, "revision_requested", ACTORS.client, { now, note: "x" })).not.toThrow();
    });

    it.each([
      [2, 2],
      [0, 0],
    ])("are blocked when %i of %i used", (revisionCount, revisionsIncluded) => {
      const o = order({ status: "delivered", revisionCount, revisionsIncluded });
      expect(() => planTransition(o, "revision_requested", ACTORS.client, { now, note: "x" })).toThrow(
        /No revisions left/,
      );
    });
  });

  describe("auto-approve", () => {
    const delivered = order({ status: "delivered", deliveredAt: T0 });
    const boundary = addDays(T0, AUTO_APPROVE_DAYS);

    it("is blocked at exactly N days", () => {
      expect(() => planTransition(delivered, "approved", ACTORS.system, { now: boundary })).toThrow(GuardError);
    });

    it("is allowed just after N days", () => {
      const plan = planTransition(delivered, "approved", ACTORS.system, { now: new Date(boundary.getTime() + 1) });
      expect(plan.effects).toContain("notify_client");
    });

    it("is blocked without delivered_at", () => {
      expect(() =>
        planTransition(order({ status: "delivered" }), "approved", ACTORS.system, { now: addDays(T0, 100) }),
      ).toThrow(GuardError);
    });
  });

  describe("refund eligibility (deadline + 10 days)", () => {
    const cases: [string, MachineOrder, Date][] = [
      // Never accepted: deadline = paid_at + turnaround (7) → eligible after day 17.
      ["paid", order({ status: "paid", paidAt: T0 }), addDays(T0, 17)],
      ["accepted", order({ status: "accepted", paidAt: T0, dueAt: addDays(T0, 3) }), addDays(T0, 13)],
      ["in_progress", order({ status: "in_progress", paidAt: T0, dueAt: addDays(T0, 30) }), addDays(T0, 40)],
    ];

    it.each(cases)("%s: refundEligibleAfter is computed from the right deadline", (_s, o, after) => {
      expect(refundEligibleAfter(o)).toEqual(after);
    });

    it.each(cases)("%s: blocked at exactly the boundary", (_s, o, after) => {
      expect(() => planTransition(o, "refund_eligible", ACTORS.system, { now: after })).toThrow(GuardError);
    });

    it.each(cases)("%s: allowed 1ms after the boundary", (_s, o, after) => {
      const plan = planTransition(o, "refund_eligible", ACTORS.system, { now: new Date(after.getTime() + 1) });
      expect(plan.patch.status).toBe("refund_eligible");
    });

    it("is never eligible without paid_at or due_at", () => {
      expect(refundEligibleAfter(order({ status: "paid" }))).toBeNull();
      expect(() =>
        planTransition(order({ status: "paid" }), "refund_eligible", ACTORS.system, { now: addDays(T0, 999) }),
      ).toThrow(GuardError);
    });
  });
});

describe("availableTransitions", () => {
  it.each([
    ["paid", "engineer", ["accepted", "declined"]],
    ["paid", "client", []],
    ["delivered", "client", ["revision_requested", "approved"]],
    ["delivered", "system", ["approved"]],
    ["revision_requested", "engineer", ["in_progress"]],
    ["draft", "client", []],
    ["completed", "system", []],
  ] as const)("%s for %s → %j", (status, who, expected) => {
    expect(availableTransitions(status, who)).toEqual(expected);
  });
});
