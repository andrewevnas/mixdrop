import { ProfileForm } from "@/components/engineer/profile-form";
import { requireRole } from "@/server/auth/session";
import { getOwnEngineerProfile } from "@/server/data/engineers";

export default async function EngineerProfilePage() {
  const { user } = await requireRole("engineer");
  const profile = await getOwnEngineerProfile(user.id);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Public profile</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
