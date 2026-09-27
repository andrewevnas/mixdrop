"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/server/auth/actions";
import { requireRole } from "@/server/auth/session";
import {
  createOrder,
  getOrderForParticipant,
  PriceChangedError,
  ServiceUnavailableError,
} from "@/server/data/orders";

import { fakePaymentsEnabled } from "./dev-payments";
import { GuardError, IllegalTransitionError, OrderNotFoundError, transitionOrder } from "./machine";
import { newOrderSchema, orderActionSchema } from "./schemas";

function fieldErrors(error: z.ZodError): FormState {
  return { fieldErrors: z.flattenError(error).fieldErrors };
}

export async function placeOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("client");
  const parsed = newOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { serviceId, expectedPricePence, songTitle, artistName, notes, referenceLinks } = parsed.data;

  let orderId: string;
  try {
    const order = await createOrder(user.id, {
      serviceId,
      expectedPricePence,
      songTitle,
      artistName,
      brief: { notes, referenceLinks },
    });
    orderId = order.id;
  } catch (e) {
    if (e instanceof ServiceUnavailableError) return { error: "That service is no longer available." };
    if (e instanceof PriceChangedError) {
      return { error: "The price of this service just changed. Reload the page to see the new price." };
    }
    throw e;
  }
  redirect(`/client/orders/${orderId}`);
}

/**
 * Any user-initiated status change. The actor's kind comes from their profile role and their id
 * from the session; transitionOrder() checks they're a participant and the move is allowed.
 */
export async function performOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, profile } = await requireRole("any");
  const parsed = orderActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { orderId, to, note } = parsed.data;

  try {
    await transitionOrder(orderId, to, { kind: profile.role, userId: user.id }, { note });
  } catch (e) {
    if (e instanceof GuardError) return { error: e.message };
    if (e instanceof IllegalTransitionError) return { error: "That action isn't available any more." };
    if (e instanceof OrderNotFoundError) notFound();
    throw e;
  }
  revalidatePath(`/${profile.role}/orders/${orderId}`);
  return {};
}

/** DEV ONLY (see dev-payments.ts): the client fires the system draft → paid transition. */
export async function simulatePayment(formData: FormData): Promise<void> {
  if (!fakePaymentsEnabled()) throw new Error("Fake payments are disabled");
  const { user } = await requireRole("client");
  const orderId = z.uuid().safeParse(formData.get("orderId"));
  if (!orderId.success) notFound();

  const order = await getOrderForParticipant(user.id, orderId.data);
  if (!order || order.clientId !== user.id) notFound();

  try {
    await transitionOrder(order.id, "paid", { kind: "system" });
  } catch (e) {
    // Already paid (double click / replay): nothing to do.
    if (!(e instanceof IllegalTransitionError)) throw e;
  }
  revalidatePath(`/client/orders/${order.id}`);
}
