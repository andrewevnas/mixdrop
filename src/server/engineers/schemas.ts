import { z } from "zod";

import { parsePriceToPence } from "@/lib/money";

export const SERVICE_TYPES = ["mix", "master", "mix_master"] as const;
export const SERVICE_TYPE_LABELS: Record<(typeof SERVICE_TYPES)[number], string> = {
  mix: "Mixing",
  master: "Mastering",
  mix_master: "Mix + master",
};

export const MIN_PRICE_PENCE = 500;
export const MAX_PRICE_PENCE = 1_000_000;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(40, "At most 40 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Letters, numbers and single hyphens only")
  .refine((s) => !RESERVED_SLUGS.has(s), "That URL is reserved");

// Names that could pass as official Mixdrop pages.
const RESERVED_SLUGS = new Set([
  "admin", "administrator", "api", "billing", "help", "mixdrop", "official", "payments",
  "root", "security", "staff", "support", "system", "team",
]);

const genresSchema = z
  .string()
  .max(400)
  .transform((s) =>
    [...new Set(s.split(",").map((g) => g.trim()).filter(Boolean))],
  )
  .pipe(z.array(z.string().max(30, "Each genre at most 30 characters")).max(8, "At most 8 genres"));

export const engineerProfileSchema = z.object({
  slug: slugSchema,
  bio: z.string().trim().max(2000, "At most 2000 characters"),
  genres: genresSchema,
});

// Digits only: rejects "", "1e1", "1.5", " 3" rather than letting coercion guess.
const intInRange = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,4}$/, "Whole number")
    .transform(Number)
    .pipe(z.number().min(min, `At least ${min}`).max(max, `At most ${max}`));

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80, "At most 80 characters"),
  type: z.enum(SERVICE_TYPES),
  price: z
    .string()
    .transform((s, ctx) => {
      const pence = parsePriceToPence(s);
      if (pence === null) {
        ctx.addIssue({ code: "custom", message: "Enter a price like 49.99" });
        return z.NEVER;
      }
      return pence;
    })
    .pipe(
      z
        .number()
        .min(MIN_PRICE_PENCE, "At least £5")
        .max(MAX_PRICE_PENCE, "At most £10,000"),
    ),
  turnaroundDays: intInRange(1, 60),
  revisionsIncluded: intInRange(0, 10),
  maxStems: intInRange(1, 200),
});

export type EngineerProfileInput = z.infer<typeof engineerProfileSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
