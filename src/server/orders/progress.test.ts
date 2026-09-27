import { describe, expect, it } from "vitest";

import type { OrderStatus } from "@/db/schema";

import { progressFromEvents } from "./progress";

const events = (...statuses: OrderStatus[]) => statuses.map((toStatus) => ({ toStatus }));
const summary = (statuses: OrderStatus[]) =>
  progressFromEvents(events(...statuses)).steps.map((s) => `${s.label}:${s.state}${s.detail ? `(${s.detail})` : ""}`);

describe("progressFromEvents", () => {
  it("draft: Submitted is current, with an awaiting-payment banner", () => {
    const p = progressFromEvents(events("draft"));
    expect(summary(["draft"])).toEqual([
      "Submitted:current",
      "Accepted:upcoming",
      "In progress:upcoming",
      "Awaiting your approval:upcoming",
      "Approved:upcoming",
    ]);
    expect(p.banner?.text).toMatch(/Awaiting payment/);
  });

  it("walks the happy path", () => {
    expect(summary(["draft", "paid"])[0]).toBe("Submitted:current");
    expect(summary(["draft", "paid", "accepted", "in_progress"])).toEqual([
      "Submitted:done",
      "Accepted:done",
      "In progress:current",
      "Awaiting your approval:upcoming",
      "Approved:upcoming",
    ]);
    expect(summary(["draft", "paid", "accepted", "in_progress", "delivered"])[3]).toBe("Awaiting your approval:current");
  });

  it("approved (and completed) marks every step done with no banner", () => {
    for (const tail of [["approved"], ["approved", "completed"]] as OrderStatus[][]) {
      const history: OrderStatus[] = ["draft", "paid", "accepted", "in_progress", "delivered", ...tail];
      expect(summary(history).every((s) => s.endsWith(":done"))).toBe(true);
      expect(progressFromEvents(events(...history)).banner).toBeUndefined();
    }
  });

  it("adds a step per revision and tracks where the current revision is", () => {
    const base: OrderStatus[] = ["draft", "paid", "accepted", "in_progress", "delivered"];
    expect(summary([...base, "revision_requested"]).slice(3)).toEqual([
      "Awaiting your approval:done",
      "Revision 1:current(Waiting for the engineer)",
      "Approved:upcoming",
    ]);
    expect(summary([...base, "revision_requested", "in_progress"])[4]).toBe(
      "Revision 1:current(Engineer is working on it)",
    );
    expect(
      summary([...base, "revision_requested", "in_progress", "delivered", "revision_requested", "in_progress", "delivered"]).slice(3),
    ).toEqual([
      "Awaiting your approval:done",
      "Revision 1:done",
      "Revision 2:current(Awaiting your approval)",
      "Approved:upcoming",
    ]);
    expect(
      summary([...base, "revision_requested", "in_progress", "delivered", "approved"]).every((s) => s.endsWith(":done")),
    ).toBe(true);
  });

  it("declined shows an error banner and stops at Submitted", () => {
    const p = progressFromEvents(events("draft", "paid", "declined"));
    expect(p.banner?.tone).toBe("error");
    expect(summary(["draft", "paid", "declined"])[0]).toBe("Submitted:current");
  });

  it("refund_eligible and refunded keep progress and add a banner", () => {
    const eligible = progressFromEvents(events("draft", "paid", "accepted", "refund_eligible"));
    expect(eligible.banner?.tone).toBe("warning");
    expect(eligible.steps[1]).toMatchObject({ label: "Accepted", state: "current" });
    expect(progressFromEvents(events("draft", "paid", "refund_eligible", "refunded")).banner?.text).toMatch(/refunded/);
  });

  it("handles an empty history like a draft", () => {
    expect(progressFromEvents([]).steps[0].state).toBe("current");
  });
});
