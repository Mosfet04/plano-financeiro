import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { plans } from "./plan";

export const financings = pgTable(
  "financings",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    principalCents: integer("principal_cents").notNull(),
    termMonths: integer("term_months").notNull(),
    /** Juros nominais ao ano: 0.076600 = 7,66% a.a. */
    annualInterest: numeric("annual_interest", {
      precision: 9,
      scale: 6,
      mode: "number",
    }).notNull(),
    system: text("system", { enum: ["SAC", "PRICE"] })
      .notNull()
      .default("SAC"),
    insuranceMonthlyCents: integer("insurance_monthly_cents").notNull().default(0),
    firstInstallmentMonth: text("first_installment_month").notNull(),
    /** Corrigir o saldo devedor pela TR. A planilha assume TR = 0. */
    applyReferenceRate: boolean("apply_reference_rate").notNull().default(false),
  },
  (t) => [index("idx_financings_plan").on(t.planId)]
);

export const extraAmortizations = pgTable(
  "extra_amortizations",
  {
    id: text("id").primaryKey(),
    financingId: text("financing_id")
      .notNull()
      .references(() => financings.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [uniqueIndex("uq_extra_amortization_per_month").on(t.financingId, t.month)]
);

/**
 * Dinheiro líquido: conta corrente, caixinha do Nubank, cofrinho do PicPay.
 * Sem `maturity_date` de propósito — liquidez diária não vence, então este
 * saldo já está no caixa do primeiro mês da projeção em vez de "cair" nele.
 *
 * Substituiu `yield_policies.cash_on_hand_cents`, que era um escalar sem
 * rendimento e sem como distinguir a conta parada da caixinha a 100% do CDI.
 */
export const cashAccounts = pgTable(
  "cash_accounts",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    balanceCents: integer("balance_cents").notNull().default(0),
    /** Nulo = não rende. */
    indexer: text("indexer", {
      enum: ["CDI_PCT", "PREFIXED", "IPCA_PLUS", "SELIC_PCT"],
    }),
    indexerValue: numeric("indexer_value", {
      precision: 9,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    /** Data civil "YYYY-MM-DD" do último saldo conferido. */
    checkedOn: text("checked_on").notNull(),
  },
  (t) => [index("idx_cash_accounts_plan").on(t.planId)]
);

export const investments = pgTable(
  "investments",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Data civil "YYYY-MM-DD". */
    maturityDate: text("maturity_date").notNull(),
    indexer: text("indexer", {
      enum: ["CDI_PCT", "PREFIXED", "IPCA_PLUS", "SELIC_PCT"],
    }).notNull(),
    indexerValue: numeric("indexer_value", {
      precision: 9,
      scale: 6,
      mode: "number",
    }).notNull(),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    instruction: text("instruction"),
  },
  (t) => [index("idx_investments_plan_maturity").on(t.planId, t.maturityDate)]
);

/**
 * Append-only: cada rodada da rotina de quinta grava uma linha nova. Nunca
 * atualize no lugar — o histórico é o que mostra a projeção envelhecendo junto
 * com a Selic.
 */
export const marketRates = pgTable(
  "market_rates",
  {
    id: text("id").primaryKey(),
    capturedAt: timestamp("captured_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    selicAnnual: numeric("selic_annual", { precision: 9, scale: 6, mode: "number" }).notNull(),
    cdiAnnual: numeric("cdi_annual", { precision: 9, scale: 6, mode: "number" }).notNull(),
    ipcaAnnual: numeric("ipca_annual", { precision: 9, scale: 6, mode: "number" }).notNull(),
    /** TR ao mês — é assim que o BCB publica a série 226. */
    referenceRateMonthly: numeric("reference_rate_monthly", {
      precision: 9,
      scale: 6,
      mode: "number",
    }),
    source: text("source", { enum: ["BCB", "AGENT", "MANUAL"] }).notNull(),
    notes: text("notes"),
    /** Resposta crua da fonte, para auditar de onde veio cada número. */
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [index("idx_market_rates_captured_at").on(t.capturedAt)]
);
