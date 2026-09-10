import { integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { users } from "./auth";

/**
 * Convenções destas tabelas:
 * - dinheiro é sempre `integer` em CENTAVOS, sufixo `_cents`;
 * - taxas são `numeric(9,6)` em decimal ao ano (0.076600 = 7,66% a.a.);
 * - mês do calendário é `text` no formato "YYYY-MM" (não é instante, não tem fuso);
 * - data civil é `text` no formato "YYYY-MM-DD".
 */
export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startMonth: text("start_month").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  /**
   * Um plano por pessoa. A regra já estava no código — `findByUserId` sempre
   * devolveu o primeiro — mas só aqui ela vira verdade: é este índice que
   * decide a corrida quando dois logins simultâneos tentam criar o plano.
   */
  (t) => [uniqueIndex("uq_plan_per_user").on(t.userId)]
);

export const incomeSettings = pgTable("income_settings", {
  planId: text("plan_id")
    .primaryKey()
    .references(() => plans.id, { onDelete: "cascade" }),
  grossSalaryCents: integer("gross_salary_cents").notNull(),
  netSalaryCents: integer("net_salary_cents").notNull(),
  annualRaise: numeric("annual_raise", { precision: 9, scale: 6, mode: "number" }).notNull(),
  raiseMonth: integer("raise_month").notNull(),
  mealCardMonthlyCents: integer("meal_card_monthly_cents").notNull().default(0),
  thirteenthNetCents: integer("thirteenth_net_cents").notNull().default(0),
  /** Meses de pagamento do 13º, separados por vírgula: "11,12". */
  thirteenthMonths: text("thirteenth_months").notNull().default("11,12"),
  vacationBonusCents: integer("vacation_bonus_cents").notNull().default(0),
  vacationMonth: integer("vacation_month").notNull().default(1),
  plrGrossSalaries: numeric("plr_gross_salaries", {
    precision: 9,
    scale: 6,
    mode: "number",
  })
    .notNull()
    .default(0),
  plrMonth: integer("plr_month").notNull().default(3),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const yieldPolicies = pgTable("yield_policies", {
  planId: text("plan_id")
    .primaryKey()
    .references(() => plans.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["MANUAL", "CDI_LINKED"] })
    .notNull()
    .default("CDI_LINKED"),
  manualAnnualNet: numeric("manual_annual_net", {
    precision: 9,
    scale: 6,
    mode: "number",
  })
    .notNull()
    .default(0.11),
  cdiPercent: numeric("cdi_percent", { precision: 9, scale: 6, mode: "number" })
    .notNull()
    .default(1),
  incomeTaxRate: numeric("income_tax_rate", { precision: 9, scale: 6, mode: "number" })
    .notNull()
    .default(0.15),
  /** Corrigir as aplicações até o vencimento em vez de usar o valor de face. */
  accrueInvestments: integer("accrue_investments").notNull().default(1),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * O resultado congelado de um mês que já acabou.
 *
 * O motor de projeção só lê o `month` — é ele que corta história de projeção.
 * Os valores são a série "o plano previu × eu fiz", e ficam congelados de
 * propósito: mudar o orçamento hoje não pode reescrever o que setembro foi.
 */
export const monthClosings = pgTable(
  "month_closings",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    leftoverCents: integer("leftover_cents").notNull(),
    planTargetCents: integer("plan_target_cents").notNull(),
    /** Caixa total no fechamento. Só para a série histórica. */
    cashCents: integer("cash_cents").notNull().default(0),
    closedAt: timestamp("closed_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [uniqueIndex("uq_month_closing_per_month").on(t.planId, t.month)]
);

export const reserveTargets = pgTable(
  "reserve_targets",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    effectiveFrom: text("effective_from").notNull(),
    months: integer("months").notNull(),
  },
  (t) => [uniqueIndex("uq_reserve_target_per_month").on(t.planId, t.effectiveFrom)]
);
