import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type {
  MonthClosingRepository,
  MonthTurnover,
  NewPlanData,
  PlanRepository,
} from "@/core/application/ports";
import type { MonthClosing } from "@/core/domain/closing/month-closing.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import type {
  IncomeSettings,
  Plan,
  ReserveTarget,
  YieldPolicy,
} from "@/core/domain/plan/plan.entity";
import type { YearMonth } from "@/core/domain/shared/month";

import type { Database } from "../client";
import {
  budgetCategories,
  cashAccounts,
  extraAmortizations,
  fgtsSettings,
  financings,
  goals,
  incomeSettings,
  investments,
  marketRates,
  monthClosings,
  plans,
  recurringItems,
  reserveTargets,
  yieldPolicies,
} from "../schema";
import {
  toBudgetCategory,
  toCashAccount,
  toExtraAmortization,
  toFgtsSettings,
  toFinancing,
  toGoal,
  toIncomeSettings,
  toInvestment,
  toMarketRates,
  toMonthClosing,
  toPlan,
  toRecurringItem,
  toReserveTarget,
  toYieldPolicy,
} from "./mappers";

/** Violação de unicidade do Postgres. O driver do Neon repassa o `code` cru. */
function isUniqueViolation(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

export class DrizzlePlanRepository implements PlanRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: string): Promise<Plan | null> {
    const row = await this.db.query.plans.findFirst({ where: eq(plans.userId, userId) });
    return row ? toPlan(row) : null;
  }

  async listAll(): Promise<Plan[]> {
    const rows = await this.db.query.plans.findMany({ orderBy: asc(plans.createdAt) });
    return rows.map(toPlan);
  }

  /**
   * Um `batch` do neon-http: as inserções vão numa transação só. O driver HTTP
   * não tem `transaction()`, mas `batch()` cobre exatamente este caso — ou o
   * plano nasce inteiro, ou não nasce.
   */
  async create(data: NewPlanData): Promise<Plan> {
    const { plan, income, yieldPolicy, categories } = data;

    const statements: BatchItem<"pg">[] = [
      this.db.insert(plans).values({
        id: plan.id,
        userId: plan.userId,
        name: plan.name,
        startMonth: plan.startMonth,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      }),
      this.db.insert(incomeSettings).values({
        planId: income.planId,
        grossSalaryCents: income.grossSalary,
        netSalaryCents: income.netSalary,
        annualRaise: income.annualRaise,
        raiseMonth: income.raiseMonth,
        mealCardMonthlyCents: income.mealCardMonthly,
        thirteenthNetCents: income.thirteenthNet,
        thirteenthMonths: income.thirteenthMonths.join(","),
        vacationBonusCents: income.vacationBonus,
        vacationMonth: income.vacationMonth,
        plrGrossSalaries: income.plrGrossSalaries,
        plrMonth: income.plrMonth,
      }),
      this.db.insert(yieldPolicies).values({
        planId: yieldPolicy.planId,
        mode: yieldPolicy.mode,
        manualAnnualNet: yieldPolicy.manualAnnualNet,
        cdiPercent: yieldPolicy.cdiPercent,
        incomeTaxRate: yieldPolicy.incomeTaxRate,
      }),
    ];

    if (categories.length > 0) {
      statements.push(
        this.db.insert(budgetCategories).values(
          categories.map((category) => ({
            id: category.id,
            planId: category.planId,
            name: category.name,
            monthlyBudgetCents: category.monthlyBudget,
            defaultPaymentMethod: category.defaultPaymentMethod,
            color: category.color,
            active: category.active,
            sortOrder: category.sortOrder,
          }))
        )
      );
    }

    if (data.reserveTargets.length > 0) {
      statements.push(
        this.db.insert(reserveTargets).values(
          data.reserveTargets.map((target) => ({
            id: target.id,
            planId: target.planId,
            effectiveFrom: target.effectiveFrom,
            months: target.months,
          }))
        )
      );
    }

    try {
      await this.db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    } catch (cause) {
      // 23505 = unique_violation. Duas abas abrindo o app ao mesmo tempo no
      // primeiro login disputam o índice único de `plans.user_id`; quem perde
      // lê o plano que a outra acabou de criar em vez de estourar na cara.
      if (!isUniqueViolation(cause)) throw cause;

      const existing = await this.findByUserId(plan.userId);
      if (existing) return existing;
      throw cause;
    }

    return plan;
  }

  /**
   * Carrega o plano inteiro de uma vez. São doze consultas em paralelo — mais
   * barato que doze idas sequenciais e simples o bastante para não justificar
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
      cashAccountRows,
      closingRows,
      fgtsRow,
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
      this.db.query.cashAccounts.findMany({
        where: eq(cashAccounts.planId, planId),
        orderBy: desc(cashAccounts.balanceCents),
      }),
      this.db.query.monthClosings.findMany({
        where: eq(monthClosings.planId, planId),
        orderBy: asc(monthClosings.month),
      }),
      this.db.query.fgtsSettings.findFirst({ where: eq(fgtsSettings.planId, planId) }),
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
      cashAccounts: cashAccountRows.map(toCashAccount),
      closings: closingRows.map(toMonthClosing),
      fgts: fgtsRow ? toFgtsSettings(fgtsRow) : null,
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

export class DrizzleMonthClosingRepository implements MonthClosingRepository {
  constructor(private readonly db: Database) {}

  async listByPlan(planId: string): Promise<MonthClosing[]> {
    const rows = await this.db.query.monthClosings.findMany({
      where: eq(monthClosings.planId, planId),
      orderBy: desc(monthClosings.month),
    });
    return rows.map(toMonthClosing);
  }

  async findByMonth(planId: string, month: YearMonth): Promise<MonthClosing | null> {
    const row = await this.db.query.monthClosings.findFirst({
      where: and(eq(monthClosings.planId, planId), eq(monthClosings.month, month)),
    });
    return row ? toMonthClosing(row) : null;
  }

  /**
   * Um `batch` do neon-http, como em `create`: o fechamento, os saldos, as
   * aplicações resgatadas e o FGTS vão numa transação só. Metade gravada é pior
   * que nada — um fechamento sem os saldos tira a sobra do mês do plano.
   */
  async settle(turnover: MonthTurnover): Promise<void> {
    const { closing } = turnover;
    const values = {
      id: closing.id,
      planId: closing.planId,
      month: closing.month,
      leftoverCents: closing.leftover,
      planTargetCents: closing.planTarget,
      cashCents: closing.cash,
      closedAt: closing.closedAt,
      note: closing.note,
    };

    const statements: BatchItem<"pg">[] = [
      // Refechar o mesmo mês sobrescreve: reabrir e fechar de novo é o fluxo
      // normal quando um lançamento atrasado aparece.
      this.db
        .insert(monthClosings)
        .values(values)
        .onConflictDoUpdate({
          target: [monthClosings.planId, monthClosings.month],
          set: {
            leftoverCents: values.leftoverCents,
            planTargetCents: values.planTargetCents,
            cashCents: values.cashCents,
            closedAt: values.closedAt,
            note: values.note,
          },
        }),
      // O `planId` no filtro é a segunda tranca: o caso de uso já conferiu que
      // as contas são do plano, mas um id trocado não pode atravessar planos.
      ...turnover.accounts.map((account) =>
        this.db
          .update(cashAccounts)
          .set({ balanceCents: account.balance, checkedOn: account.checkedOn })
          .where(and(eq(cashAccounts.id, account.id), eq(cashAccounts.planId, closing.planId)))
      ),
    ];

    if (turnover.redeemedInvestmentIds.length > 0) {
      statements.push(
        this.db
          .delete(investments)
          .where(
            and(
              inArray(investments.id, [...turnover.redeemedInvestmentIds]),
              eq(investments.planId, closing.planId)
            )
          )
      );
    }

    if (turnover.fgtsBalance !== null) {
      statements.push(
        this.db
          .update(fgtsSettings)
          .set({ balanceCents: turnover.fgtsBalance, updatedAt: new Date() })
          .where(eq(fgtsSettings.planId, closing.planId))
      );
    }

    await this.db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(monthClosings).where(eq(monthClosings.id, id));
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
