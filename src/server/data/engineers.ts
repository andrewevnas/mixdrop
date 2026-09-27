import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { type EngineerProfile, engineerProfiles, profiles, type Service, services } from "@/db/schema";
import type { EngineerProfileInput, ServiceInput } from "@/server/engineers/schemas";

// Owner functions take `userId` from the verified session (requireRole("engineer")), never the
// client, and scope every query by it. A service id belonging to someone else simply matches no rows.

export class SlugTakenError extends Error {
  constructor() {
    super("Slug already taken");
  }
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function getOwnEngineerProfile(userId: string): Promise<EngineerProfile | null> {
  const [row] = await db
    .select()
    .from(engineerProfiles)
    .where(eq(engineerProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Create or update the caller's engineer profile. Throws SlugTakenError on a slug clash. */
export async function saveOwnEngineerProfile(
  userId: string,
  input: EngineerProfileInput,
): Promise<EngineerProfile> {
  const values = { slug: input.slug, bio: input.bio, genres: input.genres };
  try {
    const [row] = await db
      .insert(engineerProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: engineerProfiles.userId, set: { ...values, updatedAt: new Date() } })
      .returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new SlugTakenError();
    throw e;
  }
}

export async function listOwnServices(userId: string): Promise<Service[]> {
  return db
    .select()
    .from(services)
    .where(eq(services.engineerId, userId))
    .orderBy(asc(services.createdAt));
}

export async function getOwnService(userId: string, serviceId: string): Promise<Service | null> {
  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.engineerId, userId)))
    .limit(1);
  return row ?? null;
}

function serviceValues(input: ServiceInput) {
  return {
    name: input.name,
    type: input.type,
    pricePence: input.price,
    turnaroundDays: input.turnaroundDays,
    revisionsIncluded: input.revisionsIncluded,
    maxStems: input.maxStems,
  };
}

/** Requires the caller to have an engineer profile (FK). */
export async function createService(userId: string, input: ServiceInput): Promise<Service> {
  const [row] = await db
    .insert(services)
    .values({ engineerId: userId, ...serviceValues(input) })
    .returning();
  return row;
}

/** Returns null if the service doesn't exist or isn't the caller's. */
export async function updateService(
  userId: string,
  serviceId: string,
  input: ServiceInput,
): Promise<Service | null> {
  const [row] = await db
    .update(services)
    .set(serviceValues(input))
    .where(and(eq(services.id, serviceId), eq(services.engineerId, userId)))
    .returning();
  return row ?? null;
}

/** Returns null if the service doesn't exist or isn't the caller's. */
export async function setServiceActive(
  userId: string,
  serviceId: string,
  active: boolean,
): Promise<Service | null> {
  const [row] = await db
    .update(services)
    .set({ active })
    .where(and(eq(services.id, serviceId), eq(services.engineerId, userId)))
    .returning();
  return row ?? null;
}

export type PublicService = Pick<
  Service,
  "id" | "name" | "type" | "pricePence" | "currency" | "turnaroundDays" | "revisionsIncluded" | "maxStems"
>;
export type PublicEngineer = {
  slug: string;
  displayName: string;
  bio: string;
  genres: string[];
  services: PublicService[];
};

/** Public view for /e/{slug}. Explicit columns only: never Stripe or other private fields. */
export async function getPublicEngineer(slug: string): Promise<PublicEngineer | null> {
  const [engineer] = await db
    .select({
      userId: engineerProfiles.userId,
      slug: engineerProfiles.slug,
      displayName: profiles.displayName,
      bio: engineerProfiles.bio,
      genres: engineerProfiles.genres,
    })
    .from(engineerProfiles)
    .innerJoin(profiles, eq(profiles.id, engineerProfiles.userId))
    .where(and(eq(engineerProfiles.slug, slug), eq(profiles.role, "engineer")))
    .limit(1);
  if (!engineer) return null;

  const activeServices = await db
    .select({
      id: services.id,
      name: services.name,
      type: services.type,
      pricePence: services.pricePence,
      currency: services.currency,
      turnaroundDays: services.turnaroundDays,
      revisionsIncluded: services.revisionsIncluded,
      maxStems: services.maxStems,
    })
    .from(services)
    .where(and(eq(services.engineerId, engineer.userId), eq(services.active, true)))
    .orderBy(asc(services.pricePence));

  return {
    slug: engineer.slug,
    displayName: engineer.displayName,
    bio: engineer.bio,
    genres: engineer.genres,
    services: activeServices,
  };
}

export type OrderableService = PublicService & { engineerName: string; engineerSlug: string };

/** Public info for an active service, for the order form. null if missing or hidden. */
export async function getOrderableService(serviceId: string): Promise<OrderableService | null> {
  const [row] = await db
    .select({
      id: services.id,
      name: services.name,
      type: services.type,
      pricePence: services.pricePence,
      currency: services.currency,
      turnaroundDays: services.turnaroundDays,
      revisionsIncluded: services.revisionsIncluded,
      maxStems: services.maxStems,
      engineerName: profiles.displayName,
      engineerSlug: engineerProfiles.slug,
    })
    .from(services)
    .innerJoin(engineerProfiles, eq(engineerProfiles.userId, services.engineerId))
    .innerJoin(profiles, eq(profiles.id, services.engineerId))
    .where(and(eq(services.id, serviceId), eq(services.active, true)))
    .limit(1);
  return row ?? null;
}
