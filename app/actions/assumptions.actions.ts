"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CATEGORY_ICONS, type PaymentMethod } from "@/core/domain/budget/budget-category.entity";
import type { ItemDirection, ItemGroup } from "@/core/domain/expense/recurring-item.entity";
import type { AmortizationSystem } from "@/core/domain/financing/financing.entity";
import type { Indexer } from "@/core/domain/investment/investment.entity";
import type { ExtraAmortizationEffect } from "@/core/domain/projection/amortization";
import type { YieldMode } from "@/core/domain/plan/plan.entity";
import { reais } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM");
const monthNumber = z.number().int().min(1).max(12);
/** Taxas chegam como decimal (0.0766), não percentual. */
const rate = z.number().min(-1).max(10);

/** Toda alteração de premissa muda a projeção — revalida as telas que a mostram. */
function revalidateProjection() {
  revalidatePath("/premissas");
  revalidatePath("/projecao");
  revalidatePath("/resumo");
  revalidatePath("/mes");
}

const incomeSchema = z.object({
  grossSalary: z.number().min(0).max(10_000_000),
  netSalary: z.number().min(0).max(10_000_000),
  annualRaise: rate,
  raiseMonth: monthNumber,
  mealCardMonthly: z.number().min(0).max(100_000),
  thirteenthNet: z.number().min(0).max(10_000_000),
  thirteenthMonths: z.array(monthNumber).min(1).max(12),
  vacationBonus: z.number().min(0).max(10_000_000),
  vacationMonth: monthNumber,
  plrGrossSalaries: z.number().min(0).max(24),
  plrMonth: monthNumber,
});

export async function saveIncomeSettings(input: z.input<typeof incomeSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  await ctx.container.repos.plans.saveIncomeSettings({
    planId: ctx.planId,
    grossSalary: reais(d.grossSalary),
    netSalary: reais(d.netSalary),
    annualRaise: d.annualRaise,
    raiseMonth: d.raiseMonth,
    mealCardMonthly: reais(d.mealCardMonthly),
    thirteenthNet: reais(d.thirteenthNet),
    thirteenthMonths: d.thirteenthMonths,
    vacationBonus: reais(d.vacationBonus),
    vacationMonth: d.vacationMonth,
    plrGrossSalaries: d.plrGrossSalaries,
    plrMonth: d.plrMonth,
  });

  revalidateProjection();
  return { ok: true as const };
}

const recurringItemSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  direction: z.enum(["INCOME", "EXPENSE"]),
  group: z.enum(["HOUSING", "FIXED"]),
  amount: z.number().min(0).max(1_000_000),
  dueDay: z.number().int().min(1).max(31).nullable().default(null),
  startsOn: monthSchema.nullable().default(null),
  endsOn: monthSchema.nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export async function saveRecurringItem(input: z.input<typeof recurringItemSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = recurringItemSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) {
    return { ok: false as const, error: "O fim não pode ser antes do início." };
  }

  if (d.id) {
    const existing = await ctx.container.repos.recurringItems.findById(d.id);
    if (!existing || existing.planId !== ctx.planId) return invalidInput;
  }

  await ctx.container.repos.recurringItems.save({
    id: d.id ?? ctx.container.ids.generate(),
    planId: ctx.planId,
    name: d.name,
    direction: d.direction as ItemDirection,
    group: d.group as ItemGroup,
    amount: reais(d.amount),
    dueDay: d.dueDay,
    startsOn: (d.startsOn as YearMonth | null) ?? null,
    endsOn: (d.endsOn as YearMonth | null) ?? null,
    active: d.active,
    sortOrder: d.sortOrder,
  });

  revalidateProjection();
  return { ok: true as const };
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteRecurringItem(input: z.input<typeof idSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.recurringItems.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.recurringItems.delete(parsed.data.id);
  revalidateProjection();
  return { ok: true as const };
}

const categorySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(60),
  monthlyBudget: z.number().min(0).max(1_000_000),
  defaultPaymentMethod: z.enum(["MEAL_CARD", "CASH"]).default("CASH"),
  color: z.string().trim().min(1).max(20).default("chart-1"),
  icon: z.enum(CATEGORY_ICONS).default("tag"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export async function saveBudgetCategory(input: z.input<typeof categorySchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  if (d.id) {
    const existing = await ctx.container.repos.categories.findById(d.id);
    if (!existing || existing.planId !== ctx.planId) return invalidInput;
  }

  await ctx.container.repos.categories.save({
    id: d.id ?? ctx.container.ids.generate(),
    planId: ctx.planId,
    name: d.name,
    monthlyBudget: reais(d.monthlyBudget),
    defaultPaymentMethod: d.defaultPaymentMethod as PaymentMethod,
    color: d.color,
    icon: d.icon,
    active: d.active,
    sortOrder: d.sortOrder,
  });

  revalidateProjection();
  return { ok: true as const };
}

export async function deleteBudgetCategory(input: z.input<typeof idSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.categories.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  // Os lançamentos ficam: a coluna vira nula (ON DELETE SET NULL) e eles
  // continuam no histórico do mês, só sem categoria.
  await ctx.container.repos.categories.delete(parsed.data.id);
  revalidateProjection();
  return { ok: true as const };
}

const financingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  principal: z.number().min(0).max(100_000_000),
  termMonths: z.number().int().min(1).max(600),
  annualInterest: rate,
  system: z.enum(["SAC", "PRICE"]),
  insuranceMonthly: z.number().min(0).max(100_000),
  firstInstallmentMonth: monthSchema,
  applyReferenceRate: z.boolean().default(false),
  extraAmortizationEffect: z.enum(["SHORTEN_TERM", "REDUCE_INSTALLMENT"]).default("SHORTEN_TERM"),
});

export async function saveFinancing(input: z.input<typeof financingSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = financingSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  const existing = await ctx.container.repos.financings.findByPlan(ctx.planId);

  await ctx.container.repos.financings.save({
    id: existing?.id ?? ctx.container.ids.generate(),
    planId: ctx.planId,
    name: d.name,
    principal: reais(d.principal),
    termMonths: d.termMonths,
    annualInterest: d.annualInterest,
    system: d.system as AmortizationSystem,
    insuranceMonthly: reais(d.insuranceMonthly),
    firstInstallmentMonth: d.firstInstallmentMonth as YearMonth,
    applyReferenceRate: d.applyReferenceRate,
    extraAmortizationEffect: d.extraAmortizationEffect as ExtraAmortizationEffect,
  });

  revalidateProjection();
  return { ok: true as const };
}

const investmentSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  amount: z.number().min(0).max(100_000_000),
  maturityDate: z.iso.date(),
  indexer: z.enum(["CDI_PCT", "PREFIXED", "IPCA_PLUS", "SELIC_PCT"]),
  indexerValue: rate,
  taxExempt: z.boolean().default(false),
  instruction: z.string().trim().max(300).nullable().default(null),
});

export async function saveInvestment(input: z.input<typeof investmentSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = investmentSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  if (d.id) {
    const existing = await ctx.container.repos.investments.findById(d.id);
    if (!existing || existing.planId !== ctx.planId) return invalidInput;
  }

  await ctx.container.repos.investments.save({
    id: d.id ?? ctx.container.ids.generate(),
    planId: ctx.planId,
    name: d.name,
    amount: reais(d.amount),
    maturityDate: d.maturityDate,
    indexer: d.indexer as Indexer,
    indexerValue: d.indexerValue,
    taxExempt: d.taxExempt,
    instruction: d.instruction,
  });

  revalidateProjection();
  return { ok: true as const };
}

export async function deleteInvestment(input: z.input<typeof idSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.investments.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.investments.delete(parsed.data.id);
  revalidateProjection();
  return { ok: true as const };
}

const cashAccountSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  balance: z.number().min(0).max(100_000_000),
  /** Nulo = o dinheiro não rende (conta corrente). */
  indexer: z.enum(["CDI_PCT", "PREFIXED", "IPCA_PLUS", "SELIC_PCT"]).nullable().default(null),
  indexerValue: rate,
  taxExempt: z.boolean().default(false),
  checkedOn: z.iso.date(),
});

export async function saveCashAccount(input: z.input<typeof cashAccountSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = cashAccountSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  if (d.id) {
    const existing = await ctx.container.repos.cashAccounts.findById(d.id);
    if (!existing || existing.planId !== ctx.planId) return invalidInput;
  }

  await ctx.container.repos.cashAccounts.save({
    id: d.id ?? ctx.container.ids.generate(),
    planId: ctx.planId,
    name: d.name,
    balance: reais(d.balance),
    indexer: d.indexer as Indexer | null,
    // Sem indexador não existe taxa: guardar um número aqui seria dado morto
    // que reaparece errado no dia em que alguém marcar um indexador.
    indexerValue: d.indexer === null ? 0 : d.indexerValue,
    taxExempt: d.taxExempt,
    checkedOn: d.checkedOn,
  });

  revalidateProjection();
  return { ok: true as const };
}

export async function deleteCashAccount(input: z.input<typeof idSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.cashAccounts.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.cashAccounts.delete(parsed.data.id);
  revalidateProjection();
  return { ok: true as const };
}

export async function deleteExtraAmortization(input: z.input<typeof idSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const financing = await ctx.container.repos.financings.findByPlan(ctx.planId);
  if (!financing) return invalidInput;

  // Confere o dono pela lista do PRÓPRIO financiamento do plano: um id vindo do
  // cliente que não esteja aqui não é seu, e não tem o que apagar.
  const extras = await ctx.container.repos.financings.listExtraAmortizations(financing.id);
  if (!extras.some((extra) => extra.id === parsed.data.id)) return invalidInput;

  await ctx.container.repos.financings.deleteExtraAmortization(parsed.data.id);
  revalidateProjection();
  return { ok: true as const };
}

const yieldSchema = z.object({
  mode: z.enum(["MANUAL", "CDI_LINKED"]),
  manualAnnualNet: rate,
  cdiPercent: z.number().min(0).max(3),
  incomeTaxRate: z.number().min(0).max(1),
  accrueInvestments: z.boolean().default(true),
});

export async function saveYieldPolicy(input: z.input<typeof yieldSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = yieldSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  await ctx.container.repos.plans.saveYieldPolicy(
    {
      planId: ctx.planId,
      mode: d.mode as YieldMode,
      manualAnnualNet: d.manualAnnualNet,
      cdiPercent: d.cdiPercent,
      incomeTaxRate: d.incomeTaxRate,
    },
    d.accrueInvestments
  );

  revalidateProjection();
  return { ok: true as const };
}

const reserveSchema = z.object({
  id: z.string().min(1).optional(),
  effectiveFrom: monthSchema,
  months: z.number().int().min(0).max(60),
});

export async function saveReserveTarget(input: z.input<typeof reserveSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = reserveSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  await ctx.container.repos.plans.saveReserveTarget({
    id: parsed.data.id ?? ctx.container.ids.generate(),
    planId: ctx.planId,
    effectiveFrom: parsed.data.effectiveFrom as YearMonth,
    months: parsed.data.months,
  });

  revalidateProjection();
  return { ok: true as const };
}

const fgtsSchema = z.object({
  enabled: z.boolean().default(false),
  balance: z.number().min(0).max(100_000_000),
  /** 8% é o que a lei manda para CLT por prazo indeterminado. */
  depositRate: z.number().min(0).max(1),
  annualYield: rate,
  /** No SFH são 24 meses. Zero significaria saque único. */
  withdrawalEveryMonths: z.number().int().min(0).max(120),
  firstWithdrawalMonth: monthSchema,
});

export async function saveFgtsSettings(input: z.input<typeof fgtsSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = fgtsSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const d = parsed.data;
  await ctx.container.repos.fgts.save({
    planId: ctx.planId,
    enabled: d.enabled,
    balance: reais(d.balance),
    depositRate: d.depositRate,
    annualYield: d.annualYield,
    withdrawalEveryMonths: d.withdrawalEveryMonths,
    firstWithdrawalMonth: d.firstWithdrawalMonth as YearMonth,
  });

  revalidateProjection();
  return { ok: true as const };
}

/**
 * Sem id: o índice único é `(financing_id, month)`, então cadastrar o mesmo mês
 * de novo sobrescreve o valor. É o modelo certo — "a amortização de mar/2027 é
 * R$ X" — e evita o nó de mover uma linha de mês, que colidiria na chave.
 */
const extraAmortizationSchema = z.object({
  month: monthSchema,
  amount: z.number().min(0).max(10_000_000),
});

export async function saveExtraAmortization(input: z.input<typeof extraAmortizationSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = extraAmortizationSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const financing = await ctx.container.repos.financings.findByPlan(ctx.planId);
  if (!financing) return { ok: false as const, error: "Nenhum financiamento cadastrado." };

  await ctx.container.repos.financings.saveExtraAmortization({
    id: ctx.container.ids.generate(),
    financingId: financing.id,
    month: parsed.data.month as YearMonth,
    amount: reais(parsed.data.amount),
  });

  revalidateProjection();
  return { ok: true as const };
}
