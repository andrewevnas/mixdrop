import { requireRole } from "@/server/auth/session";

export default async function EngineerDashboard() {
  // Checked here as well as in the layout: layouts don't re-run on client navigation.
  await requireRole("engineer");
  return (
    <>
      <h1 className="text-2xl font-semibold">Engineer dashboard</h1>
      <p className="text-muted-foreground mt-2">No incoming orders yet.</p>
    </>
  );
}
