import { z } from "zod";

import { ORDER_STATUSES } from "@/db/schema";

import { MAX_NOTE_LENGTH } from "./rules";

export const MAX_REFERENCE_LINKS = 3;

// http(s) only: links are rendered as <a href>, so javascript:/data: must never get through.
const referenceLink = z.url({ protocol: /^https?$/, message: "Links must start with http:// or https://" }).max(500);

export const newOrderSchema = z.object({
  serviceId: z.uuid(),
  // Price shown on the form; compared against the DB, never stored.
  expectedPricePence: z.string().regex(/^\d{1,9}$/).transform(Number),
  songTitle: z.string().trim().min(1, "Required").max(120, "At most 120 characters"),
  artistName: z.string().trim().min(1, "Required").max(120, "At most 120 characters"),
  notes: z.string().trim().max(4000, "At most 4000 characters"),
  referenceLinks: z
    .string()
    .max(2000)
    .transform((s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .pipe(z.array(referenceLink).max(MAX_REFERENCE_LINKS, `At most ${MAX_REFERENCE_LINKS} links`)),
});

export const orderActionSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(ORDER_STATUSES),
  note: z.string().max(MAX_NOTE_LENGTH, "Note is too long").optional(),
});

export type NewOrderForm = z.infer<typeof newOrderSchema>;
