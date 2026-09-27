// Drizzle schema. Tables are added phase by phase — see docs/ARCHITECTURE.md "Data model".
// Every table enables RLS with no policies: Supabase's public REST API (anon/publishable key)
// can't touch app data. The app reads and writes through its own server-side connection.
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
