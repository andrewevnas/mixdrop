import { OrdersList } from "@/components/orders/orders-list";
import { requireRole } from "@/server/auth/session";
import { listClientOrders } from "@/server/data/orders";

export default async function ClientDashboard() {
  // Checked here as well as in the layout: layouts don't re-run on client navigation.
  const { user } = await requireRole("client");
  const orders = await listClientOrders(user.id);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Your orders</h1>
      <OrdersList
        orders={orders}
        basePath="/client/orders"
        counterpart="engineer"
        empty="No orders yet. Find an engineer's page and pick a service to get started."
      />
    </div>
  );
}
