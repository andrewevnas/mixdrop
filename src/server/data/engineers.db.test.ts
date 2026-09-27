import { randomUUID } from "node:crypto";

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { profiles, type Role } from "@/db/schema";
import type { ServiceInput } from "@/server/engineers/schemas";

import {
  createService,
  getOwnService,
  getPublicEngineer,
  listOwnServices,
  saveOwnEngineerProfile,
  setServiceActive,
  SlugTakenError,
  updateService,
} from "./engineers";

const created: string[] = [];
const run = randomUUID().slice(0, 8);

async function makeUser(role: Role, name: string): Promise<string> {
  const id = randomUUID();
  created.push(id);
  await db.execute(sql`insert into auth.users (id, email) values (${id}, ${`${name}-${run}@example.test`})`);
  await db.insert(profiles).values({ id, role, displayName: name });
  return id;
}

const service = (overrides: Partial<ServiceInput> = {}): ServiceInput => ({
  name: "Full mix",
  type: "mix",
  price: 4999,
  turnaroundDays: 7,
  revisionsIncluded: 2,
  maxStems: 48,
  ...overrides,
});

let alice: string; // engineer, owns the services
let bob: string; // another engineer
let aliceService: string;
let hiddenService: string;

beforeAll(async () => {
  alice = await makeUser("engineer", "alice");
  bob = await makeUser("engineer", "bob");
  await saveOwnEngineerProfile(alice, { slug: `alice-${run}`, bio: "Mixes.", genres: ["pop"] });
  await saveOwnEngineerProfile(bob, { slug: `bob-${run}`, bio: "", genres: [] });
  aliceService = (await createService(alice, service())).id;
  hiddenService = (await createService(alice, service({ name: "Secret master", type: "master" }))).id;
  await setServiceActive(alice, hiddenService, false);
});

afterAll(async () => {
  // Cascades to profiles, engineer_profiles and services.
  if (created.length) await db.execute(sql`delete from auth.users where ${inArray(sql`id`, created)}`);
  await (globalThis as { pg?: { end: () => Promise<void> } }).pg?.end();
});

describe("IDOR: engineers can only touch their own services", () => {
  it("another engineer can't read, update or toggle a service", async () => {
    expect(await getOwnService(bob, aliceService)).toBeNull();
    expect(await updateService(bob, aliceService, service({ price: 100 }))).toBeNull();
    expect(await setServiceActive(bob, aliceService, false)).toBeNull();

    const unchanged = await getOwnService(alice, aliceService);
    expect(unchanged).toMatchObject({ pricePence: 4999, active: true });
  });

  it("listOwnServices only returns the caller's services", async () => {
    expect(await listOwnServices(bob)).toEqual([]);
    expect((await listOwnServices(alice)).map((s) => s.id).sort()).toEqual([aliceService, hiddenService].sort());
  });

  it("the owner can update their own service", async () => {
    const updated = await updateService(alice, aliceService, service({ price: 5999 }));
    expect(updated?.pricePence).toBe(5999);
    await updateService(alice, aliceService, service());
  });

  it("saving a profile only ever touches the caller's row", async () => {
    await saveOwnEngineerProfile(bob, { slug: `bob-${run}`, bio: "Updated", genres: [] });
    const alicePage = await getPublicEngineer(`alice-${run}`);
    expect(alicePage?.bio).toBe("Mixes.");
  });

  it("a taken slug raises SlugTakenError", async () => {
    await expect(
      saveOwnEngineerProfile(bob, { slug: `alice-${run}`, bio: "", genres: [] }),
    ).rejects.toBeInstanceOf(SlugTakenError);
  });
});

describe("getPublicEngineer", () => {
  it("returns only active services and no private fields", async () => {
    const page = await getPublicEngineer(`alice-${run}`);
    expect(page).not.toBeNull();
    expect(Object.keys(page!).sort()).toEqual(["bio", "displayName", "genres", "services", "slug"]);
    expect(page!.services.map((s) => s.id)).toEqual([aliceService]);
    expect(Object.keys(page!.services[0])).not.toContain("engineerId");
    expect(JSON.stringify(page)).not.toMatch(/stripe|payouts/i);
  });

  it("returns null for an unknown slug", async () => {
    expect(await getPublicEngineer(`nobody-${run}`)).toBeNull();
  });
});

describe("database constraints back up validation", () => {
  it.each([0, 499, 1_000_001])("rejects price %i pence even if app validation is bypassed", async (price) => {
    await expect(createService(alice, service({ price }))).rejects.toThrow();
  });

  it("rejects more than 8 genres or an over-long bio", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => `g${i}`);
    await expect(saveOwnEngineerProfile(bob, { slug: `bob-${run}`, bio: "", genres: nine })).rejects.toThrow();
    await expect(
      saveOwnEngineerProfile(bob, { slug: `bob-${run}`, bio: "x".repeat(2001), genres: [] }),
    ).rejects.toThrow();
  });

  it("rejects services for users without an engineer profile", async () => {
    const carol = await makeUser("client", "carol");
    await expect(createService(carol, service())).rejects.toThrow();
  });
});
