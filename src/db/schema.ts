// Drizzle schema. Tables are added phase by phase — see docs/ARCHITECTURE.md "Data model".
// Every table enables RLS with no policies: Supabase's public REST API (anon/publishable key)
// can't touch app data. The app reads and writes through its own server-side connection.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
