import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, ne, or } from "drizzle-orm";

import { db } from "@/db";
import {
  engineerProfiles,
  type Order,
  type OrderBrief,
  type OrderEvent,
  orderEvents,
  orders,
  profiles,
  services,
} from "@/db/schema";

// Every function here takes the caller's user id from the verified session and only returns
// orders they participate in. Engineers never see drafts (unpaid checkouts).
// Status changes go through transitionOrder() in src/server/orders/machine.ts, never here.

export class ServiceUnavailableError extends Error {
  constructor() {
    super("Service not available");
  }
}

/** The service's price changed after the client saw it. */
export class PriceChangedError extends Error {
  constructor() {
    super("Price changed");
  }
}

export type NewOrderInput = {
  serviceId: string;
  songTitle: string;
  artistName: string;
  brief: OrderBrief;
  /** The price the client was shown. Only used to detect a change; the DB price is what's stored. */
  expectedPricePence: number;
};

/** Create a draft order. Price and terms are copied from the DB service row, never the client. */
export async function createOrder(clientId: string, input: NewOrderInput): Promise<Order> {
  return db.transaction(async (tx) => {
    const [service] = await tx
      .select()
      .from(services)
      .where(and(eq(services.id, input.serviceId), eq(services.active, true)))
      .limit(1);
    if (!service) throw new ServiceUnavailableError();
    if (service.pricePence !== input.expectedPricePence) throw new PriceChangedError();

    const [order] = await tx
      .insert(orders)
      .values({
        clientId,
        engineerId: service.engineerId,
        serviceId: service.id,
        songTitle: input.songTitle,
        artistName: input.artistName,
        brief: input.brief,
        pricePence: service.pricePence,
        currency: service.currency,
        turnaroundDays: service.turnaroundDays,
        revisionsIncluded: service.revisionsIncluded,
        maxStems: service.maxStems,
      })
      .returning();

    // Creation is the first event (from_status null) so history and progress start here.
    await tx
      .insert(orderEvents)
      .values({ orderId: order.id, actorId: clientId, fromStatus: null, toStatus: "draft" });
    return order;
  });
}

const clientProfile = alias(profiles, "client_profile");
const engineerProfile = alias(profiles, "engineer_profile");

const participantFilter = (userId: string) =>
  or(eq(orders.clientId, userId), and(eq(orders.engineerId, userId), ne(orders.status, "draft")));

export type OrderDetail = Order & {
  serviceName: string;
  clientName: string;
  engineerName: string;
  engineerSlug: string;
};

const detailColumns = {
  order: orders,
  serviceName: services.name,
  clientName: clientProfile.displayName,
  engineerName: engineerProfile.displayName,
  engineerSlug: engineerProfiles.slug,
};

function detailQuery() {
  return db
    .select(detailColumns)
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(clientProfile, eq(clientProfile.id, orders.clientId))
    .innerJoin(engineerProfile, eq(engineerProfile.id, orders.engineerId))
    .innerJoin(engineerProfiles, eq(engineerProfiles.userId, orders.engineerId));
}

type DetailRow = { order: Order } & Omit<OrderDetail, keyof Order>;
const flatten = ({ order, ...rest }: DetailRow): OrderDetail => ({ ...order, ...rest });

/** null if the order doesn't exist or the caller isn't a participant. */
export async function getOrderForParticipant(userId: string, orderId: string): Promise<OrderDetail | null> {
  const [row] = await detailQuery()
    .where(and(eq(orders.id, orderId), participantFilter(userId)))
    .limit(1);
  return row ? flatten(row) : null;
}

export async function listClientOrders(clientId: string): Promise<OrderDetail[]> {
  const rows = await detailQuery().where(eq(orders.clientId, clientId)).orderBy(desc(orders.createdAt));
  return rows.map(flatten);
}

export async function listEngineerOrders(engineerId: string): Promise<OrderDetail[]> {
  const rows = await detailQuery()
    .where(and(eq(orders.engineerId, engineerId), ne(orders.status, "draft")))
    .orderBy(desc(orders.createdAt));
  return rows.map(flatten);
}

/** Event history, oldest first. Empty if the caller isn't a participant. */
export async function listOrderEvents(userId: string, orderId: string): Promise<OrderEvent[]> {
  if (!(await getOrderForParticipant(userId, orderId))) return [];
  return db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.seq));
}
