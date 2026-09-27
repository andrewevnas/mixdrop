import { OrdersList } from "@/components/orders/orders-list";
import { requireRole } from "@/server/auth/session";
import { listEngineerOrders } from "@/server/data/orders";

export default async function EngineerOrdersPage() {
  const { user } = await requireRole("engineer");
  const orders = await listEngineerOrders(user.id);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <OrdersList orders={orders} basePath="/engineer/orders" counterpart="client" empty="No orders yet." />
    </div>
  );
}
