import type { OrderStatus } from "@/db/schema";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Awaiting payment",
  paid: "New — awaiting acceptance",
  accepted: "Accepted",
  declined: "Declined",
  in_progress: "In progress",
  delivered: "Delivered",
  revision_requested: "Revision requested",
  approved: "Approved",
  refund_eligible: "Overdue — refund available",
  refunded: "Refunded",
  completed: "Completed",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span data-testid="order-status" className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
      {STATUS_LABELS[status]}
    </span>
  );
}
