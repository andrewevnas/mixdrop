import { notFound } from "next/navigation";
import { z } from "zod";

import { OrderFiles } from "@/components/files/order-files";
import { actionsFor } from "@/components/orders/action-config";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderHistory } from "@/components/orders/order-history";
import { OrderSummary } from "@/components/orders/order-summary";
import { requireRole } from "@/server/auth/session";
import { getOrderForParticipant, listOrderEvents } from "@/server/data/orders";

export default async function EngineerOrderPage({ params }: PageProps<"/engineer/orders/[id]">) {
  const { user } = await requireRole("engineer");
  const id = z.uuid().safeParse((await params).id);
  const order = id.success ? await getOrderForParticipant(user.id, id.data) : null;
  if (!order || order.engineerId !== user.id) notFound();
  const events = await listOrderEvents(user.id, order.id);

  return (
    <div className="grid gap-8">
      <OrderSummary order={order} counterpart="Client" />
      <OrderActions orderId={order.id} actions={actionsFor("engineer", order)} />
      <OrderFiles order={order} viewerId={user.id} role="engineer" />
      <section className="grid gap-3">
        <h2 className="font-medium">History</h2>
        <OrderHistory events={events} />
      </section>
    </div>
  );
}
