import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { orderEvents, orders, profiles, type Role, services } from "@/db/schema";
import { GuardError, IllegalTransitionError, OrderNotFoundError, transitionOrder } from "@/server/orders/machine";

import { createService, saveOwnEngineerProfile, setServiceActive } from "./engineers";
import {
  createOrder,
  getOrderForParticipant,
  listClientOrders,
  listEngineerOrders,
  listOrderEvents,
  PriceChangedError,
  ServiceUnavailableError,
} from "./orders";

const run = randomUUID().slice(0, 8);
const users: string[] = [];

async function makeUser(role: Role, name: string): Promise<string> {
  const id = randomUUID();
  users.push(id);
  await db.execute(sql`insert into auth.users (id, email) values (${id}, ${`${name}-${run}@example.test`})`);
  await db.insert(profiles).values({ id, role, displayName: name });
  return id;
}

let client: string;
let otherClient: string;
let engineer: string;
let otherEngineer: string;
let serviceId: string;

const brief = { notes: "Warm", referenceLinks: [] };
const newOrder = () =>
  createOrder(client, { serviceId, songTitle: "Song", artistName: "Ana", brief, expectedPricePence: 4999 });

beforeAll(async () => {
  client = await makeUser("client", "cli");
  otherClient = await makeUser("client", "cli2");
  engineer = await makeUser("engineer", "eng");
  otherEngineer = await makeUser("engineer", "eng2");
  await saveOwnEngineerProfile(engineer, { slug: `eng-${run}`, bio: "", genres: [] });
  await saveOwnEngineerProfile(otherEngineer, { slug: `eng2-${run}`, bio: "", genres: [] });
  serviceId = (
    await createService(engineer, {
      name: "Mix",
      type: "mix",
      price: 4999,
      turnaroundDays: 5,
      revisionsIncluded: 1,
      maxStems: 24,
    })
  ).id;
});

afterAll(async () => {
  // Orders restrict deletes of their participants, so remove them first.
  await db.delete(orders).where(inArray(orders.clientId, users));
  await db.execute(sql`delete from auth.users where ${inArray(sql`id`, users)}`);
  await (globalThis as { pg?: { end: () => Promise<void> } }).pg?.end();
});

describe("createOrder", () => {
  it("snapshots price and terms from the DB service and writes a creation event", async () => {
    const order = await newOrder();
    expect(order).toMatchObject({
      status: "draft",
      clientId: client,
      engineerId: engineer,
      pricePence: 4999,
      currency: "gbp",
      turnaroundDays: 5,
      revisionsIncluded: 1,
      maxStems: 24,
      revisionCount: 0,
    });
    const events = await listOrderEvents(client, order.id);
    expect(events).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "draft", actorId: client })]);
  });

  it("keeps the snapshot when the service changes later", async () => {
    const order = await newOrder();
    await db.update(services).set({ pricePence: 9999 }).where(eq(services.id, serviceId));
    expect((await getOrderForParticipant(client, order.id))?.pricePence).toBe(4999);
    await db.update(services).set({ pricePence: 4999 }).where(eq(services.id, serviceId));
  });

  it("refuses to create an order if the price changed since the client saw it", async () => {
    await expect(
      createOrder(client, { serviceId, songTitle: "S", artistName: "A", brief, expectedPricePence: 3999 }),
    ).rejects.toBeInstanceOf(PriceChangedError);
  });

  it("refuses hidden or unknown services", async () => {
    await setServiceActive(engineer, serviceId, false);
    await expect(newOrder()).rejects.toBeInstanceOf(ServiceUnavailableError);
    await setServiceActive(engineer, serviceId, true);
    await expect(
      createOrder(client, { serviceId: randomUUID(), songTitle: "S", artistName: "A", brief, expectedPricePence: 4999 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe("participant-scoped reads", () => {
  it("only the client and engineer can read an order; engineers can't see drafts", async () => {
    const order = await newOrder();
    expect(await getOrderForParticipant(client, order.id)).not.toBeNull();
    expect(await getOrderForParticipant(engineer, order.id)).toBeNull(); // draft
    expect(await getOrderForParticipant(otherClient, order.id)).toBeNull();
    expect(await getOrderForParticipant(otherEngineer, order.id)).toBeNull();
    expect(await listOrderEvents(otherClient, order.id)).toEqual([]);

    await transitionOrder(order.id, "paid", { kind: "system" });
    expect(await getOrderForParticipant(engineer, order.id)).not.toBeNull();
    expect(await getOrderForParticipant(otherEngineer, order.id)).toBeNull();
    expect((await listEngineerOrders(engineer)).map((o) => o.id)).toContain(order.id);
    expect((await listEngineerOrders(otherEngineer)).map((o) => o.id)).not.toContain(order.id);
    expect((await listClientOrders(otherClient)).map((o) => o.id)).not.toContain(order.id);
  });
});

describe("transitionOrder", () => {
  it("runs the lifecycle as far as Phase 3 allows, writing one event per transition", async () => {
    const order = await newOrder();
    await transitionOrder(order.id, "paid", { kind: "system" });
    const { order: accepted, effects } = await transitionOrder(order.id, "accepted", {
      kind: "engineer",
      userId: engineer,
    });
    expect(effects).toEqual(["notify_client"]);
    expect(accepted.dueAt!.getTime() - accepted.acceptedAt!.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
    await transitionOrder(order.id, "in_progress", { kind: "engineer", userId: engineer });

    // Phase 3 has no deliveries, so delivering is blocked by the guard.
    await expect(
      transitionOrder(order.id, "delivered", { kind: "engineer", userId: engineer }),
    ).rejects.toBeInstanceOf(GuardError);

    const events = await listOrderEvents(client, order.id);
    expect(events.map((e) => [e.fromStatus, e.toStatus, e.actorId])).toEqual([
      [null, "draft", client],
      ["draft", "paid", null],
      ["paid", "accepted", engineer],
      ["accepted", "in_progress", engineer],
    ]);
  });

  it("rejects non-participants as not found, without changing anything", async () => {
    const order = await newOrder();
    await transitionOrder(order.id, "paid", { kind: "system" });

    await expect(
      transitionOrder(order.id, "accepted", { kind: "engineer", userId: otherEngineer }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    // A client can't act as the engineer on their own order either (actor kind mismatch).
    await expect(
      transitionOrder(order.id, "accepted", { kind: "client", userId: client }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    await expect(
      transitionOrder(order.id, "accepted", { kind: "engineer", userId: client }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("paid");
    const count = await db.$count(orderEvents, eq(orderEvents.orderId, order.id));
    expect(count).toBe(2);
  });

  it("engineers get not-found (not illegal) for their own unpaid drafts", async () => {
    const order = await newOrder();
    await expect(
      transitionOrder(order.id, "accepted", { kind: "engineer", userId: engineer }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("rejects stale transitions (already moved on)", async () => {
    const order = await newOrder();
    await transitionOrder(order.id, "paid", { kind: "system" });
    await transitionOrder(order.id, "declined", { kind: "engineer", userId: engineer });
    await expect(
      transitionOrder(order.id, "accepted", { kind: "engineer", userId: engineer }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("serialises concurrent transitions: exactly one of accept/decline wins", async () => {
    const order = await newOrder();
    await transitionOrder(order.id, "paid", { kind: "system" });
    const actor = { kind: "engineer", userId: engineer } as const;
    const results = await Promise.allSettled([
      transitionOrder(order.id, "accepted", actor),
      transitionOrder(order.id, "declined", actor),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const events = await listOrderEvents(client, order.id);
    expect(events).toHaveLength(3);
  });

  it("uses the injected clock for system jobs (refund eligibility)", async () => {
    const order = await newOrder();
    const paidAt = new Date("2026-01-01T00:00:00Z");
    await transitionOrder(order.id, "paid", { kind: "system" }, { now: paidAt });
    // Never accepted: eligible after paid_at + 5 (turnaround) + 10 days.
    await expect(
      transitionOrder(order.id, "refund_eligible", { kind: "system" }, { now: new Date("2026-01-16T00:00:00Z") }),
    ).rejects.toBeInstanceOf(GuardError);
    const { order: eligible } = await transitionOrder(order.id, "refund_eligible", { kind: "system" }, {
      now: new Date("2026-01-16T00:00:01Z"),
    });
    expect(eligible.status).toBe("refund_eligible");
    await transitionOrder(order.id, "refunded", { kind: "client", userId: client });
  });
});
