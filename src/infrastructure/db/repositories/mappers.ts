import type { BudgetCategory, PaymentMethod } from "@/core/domain/budget/budget-category.entity";
import type {
  ItemDirection,
  ItemGroup,
  RecurringItem,
} from "@/core/domain/expense/recurring-item.entity";
import type {
  AmortizationSystem,
  ExtraAmortization,
  Financing,
} from "@/core/domain/financing/financing.entity";
import type { Goal, GoalStatus } from "@/core/domain/goal/goal.entity";
import type { Indexer, Investment } from "@/core/domain/investment/investment.entity";
import type { MarketRatesSnapshot, RateSource } from "@/core/domain/market/market-rates.entity";
import type {
  IncomeSettings,
  Plan,
  ReserveTarget,
  YieldMode,
  YieldPolicy,
} from "@/core/domain/plan/plan.entity";
import { cents, type Cents } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";
import type { Transaction, TransactionKind } from "@/core/domain/transaction/transaction.entity";

import type {
  budgetCategories,
  extraAmortizations,
  financings,
  goals,
  incomeSettings,
  investments,
  marketRates,
  plans,
  recurringItems,
  reserveTargets,
  transactions,
  yieldPolicies,
} from "../schema";

/**
 * Conversão linha → entidade. O banco guarda centavos como `integer` e meses
 * como texto "YYYY-MM"; aqui os tipos marcados voltam a valer.
 */
const money = (value: number): Cents => cents(value);
const month = (value: string): YearMonth => value as YearMonth;
const maybeMonth = (value: string | null): YearMonth | null =>
  value === null ? null : month(value);

export function toPlan(row: typeof plans.$inferSelect): Plan {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    startMonth: month(row.startMonth),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toIncomeSettings(row: typeof incomeSettings.$inferSelect): IncomeSettings {
  return {
    planId: row.planId,
    grossSalary: money(row.grossSalaryCents),
    netSalary: money(row.netSalaryCents),
    annualRaise: row.annualRaise,
    raiseMonth: row.raiseMonth,
    mealCardMonthly: money(row.mealCardMonthlyCents),
    thirteenthNet: money(row.thirteenthNetCents),
    thirteenthMonths: row.thirteenthMonths
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12),
    vacationBonus: money(row.vacationBonusCents),
    vacationMonth: row.vacationMonth,
    plrGrossSalaries: row.plrGrossSalaries,
    plrMonth: row.plrMonth,
  };
}

export function toYieldPolicy(row: typeof yieldPolicies.$inferSelect): YieldPolicy {
  return {
    planId: row.planId,
    mode: row.mode as YieldMode,
    manualAnnualNet: row.manualAnnualNet,
    cdiPercent: row.cdiPercent,
    incomeTaxRate: row.incomeTaxRate,
    cashOnHand: money(row.cashOnHandCents),
  };
}

export function toReserveTarget(row: typeof reserveTargets.$inferSelect): ReserveTarget {
  return {
    id: row.id,
    planId: row.planId,
    effectiveFrom: month(row.effectiveFrom),
    months: row.months,
  };
}

export function toRecurringItem(row: typeof recurringItems.$inferSelect): RecurringItem {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    direction: row.direction as ItemDirection,
    group: row.group as ItemGroup,
    amount: money(row.amountCents),
    dueDay: row.dueDay,
    startsOn: maybeMonth(row.startsOn),
    endsOn: maybeMonth(row.endsOn),
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export function toBudgetCategory(row: typeof budgetCategories.$inferSelect): BudgetCategory {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    monthlyBudget: money(row.monthlyBudgetCents),
    defaultPaymentMethod: row.defaultPaymentMethod as PaymentMethod,
    color: row.color,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export function toGoal(row: typeof goals.$inferSelect): Goal {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    amount: money(row.amountCents),
    targetMonth: maybeMonth(row.targetMonth),
    fundingSource: row.fundingSource,
    note: row.note,
    status: row.status as GoalStatus,
    sortOrder: row.sortOrder,
  };
}

export function toFinancing(row: typeof financings.$inferSelect): Financing {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    principal: money(row.principalCents),
    termMonths: row.termMonths,
    annualInterest: row.annualInterest,
    system: row.system as AmortizationSystem,
    insuranceMonthly: money(row.insuranceMonthlyCents),
    firstInstallmentMonth: month(row.firstInstallmentMonth),
    applyReferenceRate: row.applyReferenceRate,
  };
}

export function toExtraAmortization(
  row: typeof extraAmortizations.$inferSelect
): ExtraAmortization {
  return {
    id: row.id,
    financingId: row.financingId,
    month: month(row.month),
    amount: money(row.amountCents),
  };
}

export function toInvestment(row: typeof investments.$inferSelect): Investment {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    amount: money(row.amountCents),
    maturityDate: row.maturityDate,
    indexer: row.indexer as Indexer,
    indexerValue: row.indexerValue,
    taxExempt: row.taxExempt,
    instruction: row.instruction,
  };
}

export function toMarketRates(row: typeof marketRates.$inferSelect): MarketRatesSnapshot {
  return {
    id: row.id,
    capturedAt: row.capturedAt,
    selicAnnual: row.selicAnnual,
    cdiAnnual: row.cdiAnnual,
    ipcaAnnual: row.ipcaAnnual,
    referenceRateMonthly: row.referenceRateMonthly,
    source: row.source as RateSource,
    notes: row.notes,
  };
}

export function toTransaction(row: typeof transactions.$inferSelect): Transaction {
  return {
    id: row.id,
    planId: row.planId,
    date: row.date,
    description: row.description,
    kind: row.kind as TransactionKind,
    categoryId: row.categoryId,
    goalId: row.goalId,
    paymentMethod: row.paymentMethod as PaymentMethod,
    amount: money(row.amountCents),
    createdAt: row.createdAt,
  };
}
