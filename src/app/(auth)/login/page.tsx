import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

const ERRORS: Record<string, string> = {
  link: "That link is invalid or has expired. Log in, or sign up again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  // Only known codes map to text; arbitrary query strings are never rendered.
  const initialError = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New to Mixdrop?&nbsp;<Link href="/signup" className="underline">Create an account</Link>
        </>
      }
    >
      <LoginForm initialError={initialError} />
    </AuthCard>
  );
}
