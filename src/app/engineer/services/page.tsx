import Link from "next/link";

import { ServiceSummary } from "@/components/engineer/service-summary";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/server/auth/session";
import { getOwnEngineerProfile, listOwnServices } from "@/server/data/engineers";
import { toggleServiceActive } from "@/server/engineers/actions";

export default async function EngineerServicesPage() {
  const { user } = await requireRole("engineer");
  const profile = await getOwnEngineerProfile(user.id);
  if (!profile) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">Services</h1>
        <p>
          <Link href="/engineer/profile" className="underline">
            Set up your profile
          </Link>{" "}
          before adding services.
        </p>
      </div>
    );
  }
  const services = await listOwnServices(user.id);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Services</h1>
        <Link href="/engineer/services/new" className={buttonVariants()}>
          Add service
        </Link>
      </div>
      {services.length === 0 && <p className="text-muted-foreground">No services yet.</p>}
      <ul className="grid gap-3">
        {services.map((s) => (
          <li
            key={s.id}
            data-testid="service-row"
            className={`grid gap-3 rounded-lg border p-4 ${s.active ? "" : "opacity-60"}`}
          >
            <ServiceSummary service={s} />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mr-auto text-xs">{s.active ? "Active" : "Hidden"}</span>
              <Link
                href={`/engineer/services/${s.id}/edit`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Edit
              </Link>
              <form action={toggleServiceActive}>
                <input type="hidden" name="serviceId" value={s.id} />
                <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                <Button type="submit" variant="outline" size="sm">
                  {s.active ? "Hide" : "Show"}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
