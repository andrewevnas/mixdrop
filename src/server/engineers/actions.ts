"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/server/auth/actions";
import { requireRole } from "@/server/auth/session";
import {
  createService,
  getOwnEngineerProfile,
  saveOwnEngineerProfile,
  setServiceActive,
  SlugTakenError,
  updateService,
} from "@/server/data/engineers";

import { engineerProfileSchema, serviceSchema } from "./schemas";

// Every action re-checks the role and takes the user id from the session, never the form.

function fieldErrors(error: z.ZodError): FormState {
  return { fieldErrors: z.flattenError(error).fieldErrors };
}

const serviceIdSchema = z.uuid();

export async function saveEngineerProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("engineer");
  const parsed = engineerProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  try {
    await saveOwnEngineerProfile(user.id, parsed.data);
  } catch (e) {
    if (e instanceof SlugTakenError) return { fieldErrors: { slug: ["That URL is taken"] } };
    throw e;
  }
  revalidatePath("/engineer", "layout");
  return { message: "Profile saved." };
}

export async function createServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("engineer");
  if (!(await getOwnEngineerProfile(user.id))) {
    return { error: "Set up your profile before adding services." };
  }
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  await createService(user.id, parsed.data);
  revalidatePath("/engineer/services");
  redirect("/engineer/services");
}

export async function updateServiceAction(
  serviceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user } = await requireRole("engineer");
  const id = serviceIdSchema.safeParse(serviceId);
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!id.success || !(await updateService(user.id, id.data, parsed.data))) {
    return { error: "Service not found." };
  }
  revalidatePath("/engineer/services");
  redirect("/engineer/services");
}

const toggleSchema = z.object({ serviceId: z.uuid(), active: z.enum(["true", "false"]) });

export async function toggleServiceActive(formData: FormData): Promise<void> {
  const { user } = await requireRole("engineer");
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await setServiceActive(user.id, parsed.data.serviceId, parsed.data.active === "true");
  revalidatePath("/engineer/services");
}
