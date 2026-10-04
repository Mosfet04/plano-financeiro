import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { plans } from "./plan";

/** Relógios pareados e o token da rotina. Guarda o hash do token, nunca o token. */
export const devices = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["WATCH", "AGENT"] })
      .notNull()
      .default("WATCH"),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
  },
  (t) => [index("idx_devices_plan").on(t.planId)]
);

/** Pedidos de pareamento em andamento. Vivem dez minutos. */
export const devicePairings = pgTable("device_pairings", {
  id: text("id").primaryKey(),
  deviceCodeHash: text("device_code_hash").notNull().unique(),
  userCode: text("user_code").notNull().unique(),
  deviceName: text("device_name").notNull(),
  status: text("status", { enum: ["PENDING", "APPROVED"] })
    .notNull()
    .default("PENDING"),
  planId: text("plan_id").references(() => plans.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  lastPolledAt: timestamp("last_polled_at", { mode: "date", withTimezone: true }),
});
