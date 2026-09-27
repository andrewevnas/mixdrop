import { notFound } from "next/navigation";
import { z } from "zod";

import { ServiceForm } from "@/components/engineer/service-form";
import { requireRole } from "@/server/auth/session";
import { getOwnService } from "@/server/data/engineers";
import { updateServiceAction } from "@/server/engineers/actions";

export default async function EditServicePage({ params }: PageProps<"/engineer/services/[id]/edit">) {
  const { user } = await requireRole("engineer");
  const { id } = await params;
  const serviceId = z.uuid().safeParse(id);
  // Another engineer's service id is indistinguishable from a missing one.
  const service = serviceId.success ? await getOwnService(user.id, serviceId.data) : null;
  if (!service) notFound();

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Edit service</h1>
      <ServiceForm
        action={updateServiceAction.bind(null, service.id)}
        service={service}
        submitLabel="Save changes"
      />
    </div>
  );
}
