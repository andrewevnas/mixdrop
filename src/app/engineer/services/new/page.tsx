import { redirect } from "next/navigation";

import { ServiceForm } from "@/components/engineer/service-form";
import { requireRole } from "@/server/auth/session";
import { getOwnEngineerProfile } from "@/server/data/engineers";
import { createServiceAction } from "@/server/engineers/actions";

export default async function NewServicePage() {
  const { user } = await requireRole("engineer");
  if (!(await getOwnEngineerProfile(user.id))) redirect("/engineer/profile");
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Add service</h1>
      <ServiceForm action={createServiceAction} submitLabel="Add service" />
    </div>
  );
}
