"use client";

import { useActionState } from "react";

import { Field, FormMessage } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/server/auth/actions";
import { placeOrder } from "@/server/orders/actions";

export function NewOrderForm({ serviceId, pricePence }: { serviceId: string; pricePence: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(placeOrder, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-xl gap-4">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="expectedPricePence" value={pricePence} />
      <Field name="songTitle" label="Song title" required maxLength={120} errors={errors.songTitle} />
      <Field name="artistName" label="Artist name" required maxLength={120} errors={errors.artistName} />
      <div className="grid gap-2">
        <Label htmlFor="notes">Brief</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={5}
          maxLength={4000}
          placeholder="Vibe, references, anything the engineer should know."
        />
        {errors.notes?.map((e) => (
          <p key={e} className="text-destructive text-sm">{e}</p>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="referenceLinks">Reference tracks (up to 3 links, one per line)</Label>
        <Textarea id="referenceLinks" name="referenceLinks" rows={3} placeholder="https://open.spotify.com/track/…" />
        {errors.referenceLinks?.map((e) => (
          <p key={e} className="text-destructive text-sm">{e}</p>
        ))}
      </div>
      <FormMessage error={state.error ?? errors.serviceId?.[0]} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Placing order…" : "Place order"}
      </Button>
    </form>
  );
}
