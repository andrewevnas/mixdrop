"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { type FormState, logIn } from "@/server/auth/actions";

import { Field, FormMessage } from "./fields";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logIn, {
    error: initialError,
  });
  return (
    <form action={action} className="grid gap-4">
      <Field name="email" label="Email" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" required errors={state.fieldErrors?.password} />
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
