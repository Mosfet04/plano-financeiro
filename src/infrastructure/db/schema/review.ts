import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { plans } from "./plan";

/** A revisão mensal do plano, feita pela rotina do Claude. */
export const planReviews = pgTable(
  "plan_reviews",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    /** "YYYY-MM" — o mês em que a revisão foi feita. */
    month: text("month").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_plan_reviews_plan").on(t.planId, t.createdAt)]
);

/**
 * Uma sugestão da revisão. `change` e `impact` são JSON porque cada tipo de
 * mudança tem campos diferentes — e os valores dentro deles seguem a regra da
 * casa: dinheiro em centavos inteiros, mês em "YYYY-MM".
 */
export const planSuggestions = pgTable(
  "plan_suggestions",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    reviewId: text("review_id")
      .notNull()
      .references(() => planReviews.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    change: jsonb("change").notNull(),
    impact: jsonb("impact"),
    status: text("status", { enum: ["PENDING", "APPLIED", "DISMISSED", "SUPERSEDED"] })
      .notNull()
      .default("PENDING"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { mode: "date", withTimezone: true }),
  },
  (t) => [
    index("idx_plan_suggestions_review").on(t.reviewId),
    index("idx_plan_suggestions_plan_status").on(t.planId, t.status),
  ]
);
