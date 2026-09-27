// Client progress bar, derived from the order's event history (not just its current status):
// Submitted → Accepted → In progress → Awaiting your approval → (Revision n) → Approved.

import type { OrderStatus } from "@/db/schema";

export type StepState = "done" | "current" | "upcoming";
export type ProgressStep = { key: string; label: string; state: StepState; detail?: string };
export type ProgressBanner = { tone: "info" | "warning" | "error"; text: string };
export type Progress = { steps: ProgressStep[]; banner?: ProgressBanner };

type EventLike = { toStatus: OrderStatus };

const BASE: { key: string; label: string; reachedBy: OrderStatus }[] = [
  { key: "submitted", label: "Submitted", reachedBy: "paid" },
  { key: "accepted", label: "Accepted", reachedBy: "accepted" },
  { key: "in_progress", label: "In progress", reachedBy: "in_progress" },
  { key: "awaiting_approval", label: "Awaiting your approval", reachedBy: "delivered" },
];

const BANNERS: Partial<Record<OrderStatus, ProgressBanner>> = {
  draft: { tone: "info", text: "Awaiting payment." },
  declined: { tone: "error", text: "The engineer declined this order. You'll get a full refund." },
  refund_eligible: {
    tone: "warning",
    text: "This order is well past its due date. You can request a full refund.",
  },
  refunded: { tone: "info", text: "This order was refunded." },
};

const DETAIL: Partial<Record<OrderStatus, string>> = {
  revision_requested: "Waiting for the engineer",
  in_progress: "Engineer is working on it",
  delivered: "Awaiting your approval",
};

/** Events must be oldest first (as returned by listOrderEvents). */
export function progressFromEvents(events: readonly EventLike[]): Progress {
  const history = events.map((e) => e.toStatus);
  const latest = history.at(-1) ?? "draft";
  const revisions = history.filter((s) => s === "revision_requested").length;

  const steps: { key: string; label: string; reached: boolean }[] = [
    ...BASE.map((s) => ({ key: s.key, label: s.label, reached: history.includes(s.reachedBy) })),
    ...Array.from({ length: revisions }, (_, i) => ({
      key: `revision_${i + 1}`,
      label: `Revision ${i + 1}`,
      reached: true,
    })),
    { key: "approved", label: "Approved", reached: history.includes("approved") },
  ];

  const currentIndex = steps.findLastIndex((s) => s.reached);
  const finished = history.includes("approved");
  const out: ProgressStep[] = steps.map((s, i) => {
    const state: StepState =
      i < currentIndex || (finished && i === currentIndex)
        ? "done"
        : i === currentIndex
          ? "current"
          : "upcoming";
    return { key: s.key, label: s.label, state };
  });

  // Inside a revision cycle the current step's detail tracks where it's at.
  const current = out[currentIndex];
  if (current?.key.startsWith("revision_") && DETAIL[latest]) current.detail = DETAIL[latest];
  // Before payment nothing is reached yet; show Submitted as current.
  if (currentIndex === -1) out[0] = { ...out[0], state: "current" };

  return { steps: out, banner: BANNERS[latest] };
}
