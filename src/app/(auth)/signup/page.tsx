import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Artists order mixes; engineers deliver them."
      footer={
        <>
          Already have an account?&nbsp;<Link href="/login" className="underline">Log in</Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
