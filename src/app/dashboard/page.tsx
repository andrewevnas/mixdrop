import { redirect } from "next/navigation";

import { dashboardPathFor } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

export default async function DashboardPage() {
  const { profile } = await requireRole("any");
  redirect(dashboardPathFor(profile.role));
}
