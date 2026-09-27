"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { type FormState, signUp } from "@/server/auth/actions";

import { Field, FormMessage, RoleFieldset } from "./fields";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  if (state.message) return <FormMessage message={state.message} />;
  return (
    <form action={action} className="grid gap-4">
      <RoleFieldset errors={state.fieldErrors?.role} />
      <Field name="displayName" label="Display name" autoComplete="name" required errors={state.fieldErrors?.displayName} />
      <Field name="email" label="Email" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <Field name="password" label="Password" type="password" autoComplete="new-password" minLength={8} required errors={state.fieldErrors?.password} />
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
