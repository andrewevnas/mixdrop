"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus } from "@/db/schema";
import type { FormState } from "@/server/auth/actions";
import { performOrderAction } from "@/server/orders/actions";

export type OrderActionButton = {
  to: OrderStatus;
  label: string;
  variant?: "default" | "outline" | "destructive";
  /** Shown in a confirm() dialog before submitting. */
  confirm?: string;
  /** Show a required note textarea (revision requests). */
  noteLabel?: string;
  /** Rendered disabled with this explanation. */
  disabledReason?: string;
};

function ActionForm({ orderId, action }: { orderId: string; action: OrderActionButton }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(performOrderAction, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (action.confirm && !window.confirm(action.confirm)) e.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="to" value={action.to} />
      {action.noteLabel && (
        <div className="grid gap-2">
          <Label htmlFor={`note-${action.to}`}>{action.noteLabel}</Label>
          <Textarea id={`note-${action.to}`} name="note" rows={4} maxLength={2000} required />
        </div>
      )}
      <Button
        type="submit"
        variant={action.variant ?? "default"}
        disabled={pending || !!action.disabledReason}
        className="justify-self-start"
      >
        {pending ? "Working…" : action.label}
      </Button>
      {action.disabledReason && <p className="text-muted-foreground text-xs">{action.disabledReason}</p>}
      <FormMessage error={state.error ?? state.fieldErrors?.note?.[0]} />
    </form>
  );
}

export function OrderActions({ orderId, actions }: { orderId: string; actions: OrderActionButton[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="grid gap-4">
      {actions.map((a) => (
        <ActionForm key={a.to} orderId={orderId} action={a} />
      ))}
    </div>
  );
}
