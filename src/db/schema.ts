// Drizzle schema. Tables are added phase by phase — see docs/ARCHITECTURE.md "Data model".
// Every table enables RLS with no policies: Supabase's public REST API (anon/publishable key)
// can't touch app data. The app reads and writes through its own server-side connection.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

export const roleEnum = pgEnum("role", ["client", "engineer"]);

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export type Profile = typeof profiles.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const engineerProfiles = pgTable(
  "engineer_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    bio: text("bio").notNull().default(""),
    genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
    // Private: never select these for public pages.
    stripeAccountId: text("stripe_account_id"),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    ...timestamps,
  },
  // DB checks mirror src/server/engineers/schemas.ts so no write path can bypass them.
  (t) => [
    check("engineer_profiles_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("engineer_profiles_slug_length", sql`char_length(${t.slug}) between 3 and 40`),
    check("engineer_profiles_bio_length", sql`char_length(${t.bio}) <= 2000`),
    check("engineer_profiles_genres_count", sql`cardinality(${t.genres}) <= 8`),
  ],
).enableRLS();

export const serviceTypeEnum = pgEnum("service_type", ["mix", "master", "mix_master"]);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: uuid("engineer_id")
      .notNull()
      .references(() => engineerProfiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: serviceTypeEnum("type").notNull(),
    // Money is integer minor units (pence). GBP only for now.
    pricePence: integer("price_pence").notNull(),
    currency: text("currency").notNull().default("gbp"),
    turnaroundDays: integer("turnaround_days").notNull(),
    revisionsIncluded: integer("revisions_included").notNull(),
    maxStems: integer("max_stems").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("services_engineer_id_idx").on(t.engineerId),
    // £5–£10,000; mirrors MIN/MAX_PRICE_PENCE in src/server/engineers/schemas.ts.
    check("services_price_range", sql`${t.pricePence} between 500 and 1000000`),
    check("services_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("services_currency_gbp", sql`${t.currency} = 'gbp'`),
    check("services_turnaround_range", sql`${t.turnaroundDays} between 1 and 60`),
    check("services_revisions_range", sql`${t.revisionsIncluded} between 0 and 10`),
    check("services_max_stems_range", sql`${t.maxStems} between 1 and 200`),
  ],
).enableRLS();

export type EngineerProfile = typeof engineerProfiles.$inferSelect;
export type Service = typeof services.$inferSelect;
export type ServiceType = (typeof serviceTypeEnum.enumValues)[number];

// See docs/order-state-machine.md. Status only changes via transitionOrder() in src/server/orders.
export const ORDER_STATUSES = [
  "draft",
  "paid",
  "accepted",
  "declined",
  "in_progress",
  "delivered",
  "revision_requested",
  "approved",
  "refund_eligible",
  "refunded",
  "completed",
] as const;
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

export type OrderBrief = { notes: string; referenceLinks: string[] };

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Orders are financial records: participants and services can't be deleted out from under them.
    clientId: uuid("client_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    engineerId: uuid("engineer_id")
      .notNull()
      .references(() => engineerProfiles.userId, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("draft"),
    songTitle: text("song_title").notNull(),
    artistName: text("artist_name").notNull(),
    brief: jsonb("brief_json").$type<OrderBrief>().notNull(),
    // Snapshot of the service's terms when ordered; later service edits don't change the order.
    pricePence: integer("price_pence").notNull(),
    currency: text("currency").notNull(),
    turnaroundDays: integer("turnaround_days").notNull(),
    revisionsIncluded: integer("revisions_included").notNull(),
    maxStems: integer("max_stems").notNull(),
    revisionCount: integer("revision_count").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_client_id_idx").on(t.clientId),
    index("orders_engineer_id_idx").on(t.engineerId),
    check("orders_price_range", sql`${t.pricePence} between 500 and 1000000`),
    check("orders_currency_gbp", sql`${t.currency} = 'gbp'`),
    check("orders_revision_count_range", sql`${t.revisionCount} between 0 and ${t.revisionsIncluded}`),
    check("orders_song_title_length", sql`char_length(${t.songTitle}) between 1 and 120`),
    check("orders_artist_name_length", sql`char_length(${t.artistName}) between 1 and 120`),
    // Brief is ~4KB of notes + 3 links when validated; cap the raw JSON well above that.
    check("orders_brief_size", sql`pg_column_size(${t.brief}) < 16384`),
  ],
).enableRLS();

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Insertion order; timestamps can tie.
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // null = system (webhook, scheduled job).
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    // null = order creation.
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_events_order_id_seq_idx").on(t.orderId, t.seq),
    check("order_events_note_length", sql`char_length(${t.note}) <= 2000`),
  ],
).enableRLS();

export type Order = typeof orders.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
