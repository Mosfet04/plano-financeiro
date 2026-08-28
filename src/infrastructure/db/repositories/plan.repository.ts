import { and, asc, desc, eq } from "drizzle-orm";

import type { PlanRepository } from "@/core/application/ports";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import type {
  IncomeSettings,
  Plan,
  ReserveTarget,
  YieldPolicy,
} from "@/core/domain/plan/plan.entity";

import type { Database } from "../client";
import {
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
  yieldPolicies,
} from "../schema";
import {
  toBudgetCategory,
  toExtraAmortization,
  toFinancing,
  toGoal,
  toIncomeSettings,
  toInvestment,
  toMarketRates,
  toPlan,
  toRecurringItem,
  toReserveTarget,
  toYieldPolicy,
} from "./mappers";

export class DrizzlePlanRepository implements PlanRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: string): Promise<Plan | null> {
    const row = await this.db.query.plans.findFirst({ where: eq(plans.userId, userId) });
    return row ? toPlan(row) : null;
  }

  /**
   * Carrega o plano inteiro de uma vez. São nove consultas em paralelo — mais
   * barato que nove idas sequenciais e simples o bastante para não justificar
   * uma view ou um join gigante.
   */
  async loadSnapshot(planId: string): Promise<PlanSnapshot | null> {
    const [
      planRow,
      incomeRow,
      yieldRow,
      itemRows,
      categoryRows,
      goalRows,
      financingRow,
      investmentRows,
      reserveRows,
      ratesRow,
    ] = await Promise.all([
      this.db.query.plans.findFirst({ where: eq(plans.id, planId) }),
      this.db.query.incomeSettings.findFirst({ where: eq(incomeSettings.planId, planId) }),
      this.db.query.yieldPolicies.findFirst({ where: eq(yieldPolicies.planId, planId) }),
      this.db.query.recurringItems.findMany({
        where: eq(recurringItems.planId, planId),
        orderBy: asc(recurringItems.sortOrder),
      }),
      this.db.query.budgetCategories.findMany({
        where: eq(budgetCategories.planId, planId),
        orderBy: asc(budgetCategories.sortOrder),
      }),
      this.db.query.goals.findMany({
        where: eq(goals.planId, planId),
        orderBy: asc(goals.sortOrder),
      }),
      this.db.query.financings.findFirst({ where: eq(financings.planId, planId) }),
      this.db.query.investments.findMany({
        where: eq(investments.planId, planId),
        orderBy: asc(investments.maturityDate),
      }),
      this.db.query.reserveTargets.findMany({
        where: eq(reserveTargets.planId, planId),
        orderBy: asc(reserveTargets.effectiveFrom),
      }),
      this.db.query.marketRates.findFirst({ orderBy: desc(marketRates.capturedAt) }),
    ]);

    if (!planRow || !incomeRow || !yieldRow) return null;

    const extras = financingRow
      ? await this.db.query.extraAmortizations.findMany({
          where: eq(extraAmortizations.financingId, financingRow.id),
          orderBy: asc(extraAmortizations.month),
        })
      : [];

    return {
      plan: toPlan(planRow),
      income: toIncomeSettings(incomeRow),
      yieldPolicy: toYieldPolicy(yieldRow),
      accrueInvestments: yieldRow.accrueInvestments === 1,
      recurringItems: itemRows.map(toRecurringItem),
      categories: categoryRows.map(toBudgetCategory),
      goals: goalRows.map(toGoal),
      financing: financingRow ? toFinancing(financingRow) : null,
      extraAmortizations: extras.map(toExtraAmortization),
      investments: investmentRows.map(toInvestment),
      reserveTargets: reserveRows.map(toReserveTarget),
      rates: ratesRow ? toMarketRates(ratesRow) : null,
    };
  }

  async saveIncomeSettings(settings: IncomeSettings): Promise<void> {
    const values = {
      planId: settings.planId,
      grossSalaryCents: settings.grossSalary,
      netSalaryCents: settings.netSalary,
      annualRaise: settings.annualRaise,
      raiseMonth: settings.raiseMonth,
      mealCardMonthlyCents: settings.mealCardMonthly,
      thirteenthNetCents: settings.thirteenthNet,
      thirteenthMonths: settings.thirteenthMonths.join(","),
      vacationBonusCents: settings.vacationBonus,
      vacationMonth: settings.vacationMonth,
      plrGrossSalaries: settings.plrGrossSalaries,
      plrMonth: settings.plrMonth,
      updatedAt: new Date(),
    };

    await this.db
      .insert(incomeSettings)
      .values(values)
      .onConflictDoUpdate({ target: incomeSettings.planId, set: values });
  }

  async saveYieldPolicy(policy: YieldPolicy, accrueInvestments: boolean): Promise<void> {
    const values = {
      planId: policy.planId,
      mode: policy.mode,
      manualAnnualNet: policy.manualAnnualNet,
      cdiPercent: policy.cdiPercent,
      incomeTaxRate: policy.incomeTaxRate,
      cashOnHandCents: policy.cashOnHand,
      accrueInvestments: accrueInvestments ? 1 : 0,
      updatedAt: new Date(),
    };

    await this.db
      .insert(yieldPolicies)
      .values(values)
      .onConflictDoUpdate({ target: yieldPolicies.planId, set: values });
  }

  async saveReserveTarget(target: ReserveTarget): Promise<void> {
    const values = {
      id: target.id,
      planId: target.planId,
      effectiveFrom: target.effectiveFrom,
      months: target.months,
    };

    await this.db
      .insert(reserveTargets)
      .values(values)
      .onConflictDoUpdate({
        target: [reserveTargets.planId, reserveTargets.effectiveFrom],
        set: { months: target.months },
      });
  }

  async deleteReserveTarget(id: string): Promise<void> {
    await this.db.delete(reserveTargets).where(eq(reserveTargets.id, id));
  }
}

/** Guarda usada pelas actions: o plano tem que ser do usuário logado. */
export async function planBelongsToUser(
  db: Database,
  planId: string,
  userId: string
): Promise<boolean> {
  const row = await db.query.plans.findFirst({
    where: and(eq(plans.id, planId), eq(plans.userId, userId)),
    columns: { id: true },
  });
  return row !== undefined;
}
