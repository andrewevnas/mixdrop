import { notFound } from "next/navigation";
import { z } from "zod";

import { OrderFiles } from "@/components/files/order-files";
import { actionsFor } from "@/components/orders/action-config";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderHistory } from "@/components/orders/order-history";
import { OrderSummary } from "@/components/orders/order-summary";
import { ProgressBar } from "@/components/orders/progress-bar";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/session";
import { getOrderForParticipant, listOrderEvents } from "@/server/data/orders";
import { simulatePayment } from "@/server/orders/actions";
import { fakePaymentsEnabled } from "@/server/orders/dev-payments";
import { progressFromEvents } from "@/server/orders/progress";

export default async function ClientOrderPage({ params }: PageProps<"/client/orders/[id]">) {
  const { user } = await requireRole("client");
  const id = z.uuid().safeParse((await params).id);
  const order = id.success ? await getOrderForParticipant(user.id, id.data) : null;
  if (!order || order.clientId !== user.id) notFound();
  const events = await listOrderEvents(user.id, order.id);

  return (
    <div className="grid gap-8">
      <OrderSummary order={order} counterpart="Engineer" />
      <ProgressBar progress={progressFromEvents(events)} />
      {order.status === "draft" && fakePaymentsEnabled() && (
        <form action={simulatePayment} className="grid gap-2 rounded-lg border border-dashed p-4">
          <input type="hidden" name="orderId" value={order.id} />
          <p className="text-muted-foreground text-sm">Dev only: payments arrive in Phase 6.</p>
          <Button type="submit" className="justify-self-start">
            Simulate payment
          </Button>
        </form>
      )}
      <OrderActions orderId={order.id} actions={actionsFor("client", order)} />
      <OrderFiles order={order} viewerId={user.id} role="client" />
      <section className="grid gap-3">
        <h2 className="font-medium">History</h2>
        <OrderHistory events={events} />
      </section>
    </div>
  );
}
