"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { completeOnboarding, type FormState } from "@/server/auth/actions";

import { Field, FormMessage, RoleFieldset } from "./fields";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(completeOnboarding, {});
  return (
    <form action={action} className="grid gap-4">
      <RoleFieldset errors={state.fieldErrors?.role} />
      <Field name="displayName" label="Display name" autoComplete="name" required errors={state.fieldErrors?.displayName} />
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
