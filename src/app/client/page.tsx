import { requireRole } from "@/server/auth/session";

export default async function ClientDashboard() {
  // Checked here as well as in the layout: layouts don't re-run on client navigation.
  await requireRole("client");
  return (
    <>
      <h1 className="text-2xl font-semibold">Your orders</h1>
      <p className="text-muted-foreground mt-2">No orders yet.</p>
    </>
  );
}
