import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { plans } from "./plan";

/**
 * Conta recorrente com vigência. O aluguel é um item que TERMINA no mês da
 * mudança; o condomínio é um que COMEÇA nele. Sem essas datas, o motor
 * precisaria de casos especiais para moradia.
 */
export const recurringItems = pgTable(
  "recurring_items",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    direction: text("direction", { enum: ["INCOME", "EXPENSE"] }).notNull(),
    group: text("item_group", { enum: ["HOUSING", "FIXED"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueDay: integer("due_day"),
    /** "YYYY-MM"; nulo = vale desde sempre. */
    startsOn: text("starts_on"),
    /** "YYYY-MM"; nulo = não acaba. */
    endsOn: text("ends_on"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("idx_recurring_items_plan").on(t.planId)]
);

export const budgetCategories = pgTable(
  "budget_categories",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    monthlyBudgetCents: integer("monthly_budget_cents").notNull(),
    defaultPaymentMethod: text("default_payment_method", {
      enum: ["MEAL_CARD", "CASH"],
    })
      .notNull()
      .default("CASH"),
    color: text("color").notNull().default("chart-1"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("idx_budget_categories_plan").on(t.planId)]
);

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** "YYYY-MM"; nulo = meta sem data, não entra na conta. */
    targetMonth: text("target_month"),
    fundingSource: text("funding_source"),
    note: text("note"),
    status: text("status", { enum: ["PLANNED", "DONE", "CANCELLED"] })
      .notNull()
      .default("PLANNED"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_goals_plan").on(t.planId)]
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    /** Data civil "YYYY-MM-DD". */
    date: text("date").notNull(),
    description: text("description").notNull(),
    kind: text("kind", { enum: ["EXPENSE", "EXTRA_INCOME", "GOAL"] })
      .notNull()
      .default("EXPENSE"),
    categoryId: text("category_id").references(() => budgetCategories.id, {
      onDelete: "set null",
    }),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method", { enum: ["MEAL_CARD", "CASH"] })
      .notNull()
      .default("CASH"),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_transactions_plan_date").on(t.planId, t.date)]
);
