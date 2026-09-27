"use client";

import { useActionState } from "react";

import { Field, FormMessage } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Service } from "@/db/schema";
import { penceToInput } from "@/lib/money";
import type { FormState } from "@/server/auth/actions";
import { SERVICE_TYPE_LABELS, SERVICE_TYPES } from "@/server/engineers/schemas";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function ServiceForm({
  action: serverAction,
  service,
  submitLabel,
}: {
  action: Action;
  service?: Service;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-xl gap-4">
      <Field name="name" label="Name" defaultValue={service?.name} placeholder="Full mix" required errors={errors.name} />
      <div className="grid gap-2">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          name="type"
          defaultValue={service?.type ?? "mix"}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SERVICE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <Field
        name="price"
        label="Price (£)"
        inputMode="decimal"
        defaultValue={service ? penceToInput(service.pricePence) : undefined}
        placeholder="49.99"
        required
        errors={errors.price}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="turnaroundDays" label="Turnaround (days)" type="number" min={1} max={60} defaultValue={service?.turnaroundDays ?? 7} required errors={errors.turnaroundDays} />
        <Field name="revisionsIncluded" label="Revisions included" type="number" min={0} max={10} defaultValue={service?.revisionsIncluded ?? 2} required errors={errors.revisionsIncluded} />
        <Field name="maxStems" label="Max stems" type="number" min={1} max={200} defaultValue={service?.maxStems ?? 48} required errors={errors.maxStems} />
      </div>
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
