import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { dashboardPathFor } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/data/profiles";

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (profile) redirect(dashboardPathFor(profile.role));
  return (
    <AuthCard title="Finish setting up" description="Tell us how you'll use Mixdrop. This can't be changed later.">
      <OnboardingForm />
    </AuthCard>
  );
}
