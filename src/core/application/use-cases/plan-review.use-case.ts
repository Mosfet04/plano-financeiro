import { closingSlack, pendingTurnover } from "@/core/domain/closing/month-closing.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { setBoostFrom } from "@/core/domain/plan/savings-boost.entity";
import {
  projectPlan,
  type MonthProjection,
  type ProjectionSummary,
} from "@/core/domain/projection/project-plan";
import { cashAccountAnnualNet } from "@/core/domain/projection/yield";
import {
  applyChanges,
  impactOf,
  SuggestionKind,
  SuggestionStatus,
  type PlanSuggestion,
  type ProjectionImpact,
  type ReviewWithSuggestions,
  type SuggestionChange,
} from "@/core/domain/review/plan-review.entity";
import { addCents, type Cents } from "@/core/domain/shared/money";
import {
  addMonths,
  daysBetweenDates,
  monthOfISODate,
  type YearMonth,
} from "@/core/domain/shared/month";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";

import type {
  BudgetCategoryRepository,
  Clock,
  FinancingRepository,
  GoalRepository,
  IdGenerator,
  PlanRepository,
  PlanReviewRepository,
} from "../ports";
import type { CloseMonthUseCase } from "./close-month.use-case";
import { buildProjectionInput, DEFAULT_HORIZON_MONTHS } from "./get-projection.use-case";

/** Meses de gasto por categoria que a revisão olha para trás. */
const SPENDING_MONTHS = 3;
const CLOSINGS_SHOWN = 12;
const MONTHS_AHEAD = 24;
/** Revisões anteriores que voltam para o agente — a memória dele entre um mês e outro. */
const PREVIOUS_REVIEWS = 3;

export interface ReviewOverview {
  readonly today: string;
  readonly month: YearMonth;
  readonly planName: string;
  /** Mês cuja virada ainda não foi feita. Com ele pendente, os saldos estão velhos. */
  readonly pendingTurnover: YearMonth | null;
  readonly headline: {
    readonly payoffMonth: YearMonth | null;
    readonly minCash: Cents;
    readonly minCashMonth: YearMonth | null;
    readonly monthlyTopUpToFixHole: Cents;
    readonly leftoverFirstMonth: Cents;
    readonly typicalLeftoverAfterMove: Cents;
    readonly costOfLivingAfterMove: Cents;
    readonly openingCash: Cents;
    readonly startMonth: YearMonth;
    readonly closedThrough: YearMonth | null;
    readonly netAnnualYield: number;
    readonly cashAnnualYield: number;
    readonly amortizationAdvice: ProjectionSummary["amortizationAdvice"];
  };
  readonly income: PlanSnapshot["income"];
  readonly recurringItems: readonly {
    readonly name: string;
    readonly direction: string;
    readonly group: string;
    readonly amount: Cents;
    readonly startsOn: YearMonth | null;
    readonly endsOn: YearMonth | null;
  }[];
  readonly categories: readonly {
    readonly id: string;
    readonly name: string;
    readonly monthlyBudget: Cents;
    readonly paymentMethod: string;
    readonly active: boolean;
  }[];
  /** Orçado × gasto dos últimos meses, por categoria. */
  readonly spending: readonly {
    readonly month: YearMonth;
    readonly closed: boolean;
    readonly categories: readonly {
      readonly categoryId: string;
      readonly name: string;
      readonly budget: Cents;
      readonly spent: Cents;
    }[];
    readonly variableSpent: Cents;
    readonly goalSpent: Cents;
    readonly extraIncome: Cents;
    readonly leftover: Cents;
    readonly planTarget: Cents;
  }[];
  /** O plano previu × eu fiz, congelado no fechamento. */
  readonly closings: readonly {
    readonly month: YearMonth;
    readonly leftover: Cents;
    readonly planTarget: Cents;
    readonly slack: Cents;
    readonly cash: Cents;
    readonly note: string | null;
  }[];
  readonly goals: readonly {
    readonly id: string;
    readonly name: string;
    readonly amount: Cents;
    readonly targetMonth: YearMonth | null;
    readonly fundingSource: string | null;
    readonly note: string | null;
    readonly status: string;
    /** Reserva + caixa de quitação no fim do mês da meta, já descontada ela. */
    readonly cashAfterTargetMonth: Cents | null;
  }[];
  readonly financing: {
    readonly system: string;
    readonly annualInterest: number;
    readonly termMonths: number;
    readonly firstInstallmentMonth: YearMonth;
    readonly applyReferenceRate: boolean;
    readonly extraAmortizationEffect: string;
    readonly extraAmortizations: readonly { readonly month: YearMonth; readonly amount: Cents }[];
  } | null;
  readonly cashAccounts: readonly {
    readonly name: string;
    readonly balance: Cents;
    readonly checkedOn: string;
    readonly daysSinceCheck: number;
    readonly indexer: string | null;
    readonly indexerValue: number;
    readonly taxExempt: boolean;
    readonly annualNetYield: number;
  }[];
  readonly investments: readonly {
    readonly name: string;
    readonly amount: Cents;
    readonly maturityDate: string;
    readonly indexer: string;
    readonly indexerValue: number;
    readonly instruction: string | null;
  }[];
  readonly fgts: {
    readonly enabled: boolean;
    readonly balance: Cents;
    readonly firstWithdrawalMonth: YearMonth;
    readonly withdrawalEveryMonths: number;
  } | null;
  readonly reserveTargets: readonly {
    readonly effectiveFrom: YearMonth;
    readonly months: number;
  }[];
  readonly rates: {
    readonly selicAnnual: number;
    readonly cdiAnnual: number;
    readonly ipcaAnnual: number;
    readonly referenceRateMonthly: number | null;
    readonly capturedAt: string;
  } | null;
  /** As linhas da projeção daqui para a frente. */
  readonly months: readonly MonthProjection[];
  readonly previousReviews: readonly {
    readonly month: YearMonth;
    readonly createdAt: string;
    readonly summary: string;
    readonly suggestions: readonly {
      readonly title: string;
      readonly rationale: string;
      readonly change: SuggestionChange;
      readonly status: SuggestionStatus;
      readonly impact: ProjectionImpact | null;
      readonly decidedAt: string | null;
    }[];
  }[];
}

export interface NewSuggestion {
  readonly title: string;
  readonly rationale: string;
  readonly change: SuggestionChange;
}

export interface SubmitReviewInput {
  readonly planId: string;
  readonly summary: string;
  readonly suggestions: readonly NewSuggestion[];
}

/**
 * A revisão mensal do plano, feita por um agente e decidida por você.
 *
 * O agente lê (`overview`), testa hipóteses no motor real (`simulate`) e
 * entrega a revisão (`submit`). Nada do que ele manda mexe no plano: vira
 * sugestão, com o impacto medido aqui, e só `decide` aplica — chamado da tela,
 * com a sua sessão.
 */
export class PlanReviewUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly closeMonth: CloseMonthUseCase,
    private readonly reviews: PlanReviewRepository,
    private readonly categories: BudgetCategoryRepository,
    private readonly goals: GoalRepository,
    private readonly financings: FinancingRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async overview(planId: string): Promise<Result<ReviewOverview>> {
    const snapshot = await this.plans.loadSnapshot(planId);
    if (!snapshot) return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));

    const today = this.clock.today();
    const month = monthOfISODate(today);
    const projection = this.project(snapshot);

    const spendingMonths: YearMonth[] = [];
    for (let back = SPENDING_MONTHS; back >= 1; back--) {
      const candidate = addMonths(month, -back);
      if (candidate >= snapshot.plan.startMonth) spendingMonths.push(candidate);
    }
    const spending = [];
    for (const spendingMonth of spendingMonths) {
      const closed = await this.closeMonth.execute({ planId, month: spendingMonth });
      if (!closed.ok) return closed;
      const value = closed.value;
      spending.push({
        month: spendingMonth,
        closed: snapshot.closings.some((closing) => closing.month === spendingMonth),
        categories: value.categories.map((row) => ({
          categoryId: row.category.id,
          name: row.category.name,
          budget: row.budget,
          spent: row.spent,
        })),
        variableSpent: value.variableSpent,
        goalSpent: value.goalSpent,
        extraIncome: value.extraIncome,
        leftover: value.leftover,
        planTarget: value.planTarget,
      });
    }

    const cashAt = (target: YearMonth): Cents | null => {
      const row = projection.months.find((candidate) => candidate.month === target);
      return row ? addCents(row.reserve, row.payoffCash) : null;
    };

    const history = await this.reviews.listRecent(planId, PREVIOUS_REVIEWS);

    return ok({
      today,
      month,
      planName: snapshot.plan.name,
      pendingTurnover: pendingTurnover(today, snapshot.closings, snapshot.plan.startMonth),
      headline: {
        payoffMonth: projection.payoffMonth,
        minCash: projection.minCash,
        minCashMonth: projection.minCashMonth,
        monthlyTopUpToFixHole: projection.monthlyTopUpToFixHole,
        leftoverFirstMonth: projection.leftoverFirstMonth,
        typicalLeftoverAfterMove: projection.typicalLeftoverAfterMove,
        costOfLivingAfterMove: projection.costOfLivingAfterMove,
        openingCash: projection.openingCash,
        startMonth: projection.startMonth,
        closedThrough: projection.closedThrough,
        netAnnualYield: projection.netAnnualYield,
        cashAnnualYield: projection.cashAnnualYield,
        amortizationAdvice: projection.amortizationAdvice,
      },
      income: snapshot.income,
      recurringItems: snapshot.recurringItems
        .filter((item) => item.active && (item.endsOn === null || item.endsOn >= month))
        .map((item) => ({
          name: item.name,
          direction: item.direction,
          group: item.group,
          amount: item.amount,
          startsOn: item.startsOn,
          endsOn: item.endsOn,
        })),
      categories: snapshot.categories.map((category) => ({
        id: category.id,
        name: category.name,
        monthlyBudget: category.monthlyBudget,
        paymentMethod: category.defaultPaymentMethod,
        active: category.active,
      })),
      spending,
      closings: [...snapshot.closings]
        .sort((a, b) => (a.month < b.month ? 1 : -1))
        .slice(0, CLOSINGS_SHOWN)
        .map((closing) => ({
          month: closing.month,
          leftover: closing.leftover,
          planTarget: closing.planTarget,
          slack: closingSlack(closing),
          cash: closing.cash,
          note: closing.note,
        })),
      goals: snapshot.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        amount: goal.amount,
        targetMonth: goal.targetMonth,
        fundingSource: goal.fundingSource,
        note: goal.note,
        status: goal.status,
        cashAfterTargetMonth: goal.targetMonth ? cashAt(goal.targetMonth) : null,
      })),
      financing: snapshot.financing
        ? {
            system: snapshot.financing.system,
            annualInterest: snapshot.financing.annualInterest,
            termMonths: snapshot.financing.termMonths,
            firstInstallmentMonth: snapshot.financing.firstInstallmentMonth,
            applyReferenceRate: snapshot.financing.applyReferenceRate,
            extraAmortizationEffect: snapshot.financing.extraAmortizationEffect,
            extraAmortizations: snapshot.extraAmortizations.map((extra) => ({
              month: extra.month,
              amount: extra.amount,
            })),
          }
        : null,
      cashAccounts: snapshot.cashAccounts.map((account) => ({
        name: account.name,
        balance: account.balance,
        checkedOn: account.checkedOn,
        daysSinceCheck: daysBetweenDates(account.checkedOn, today),
        indexer: account.indexer,
        indexerValue: account.indexerValue,
        taxExempt: account.taxExempt,
        annualNetYield: cashAccountAnnualNet(
          account,
          snapshot.rates,
          snapshot.yieldPolicy.incomeTaxRate
        ),
      })),
      investments: snapshot.investments
        .filter((investment) => investment.maturityDate >= today)
        .map((investment) => ({
          name: investment.name,
          amount: investment.amount,
          maturityDate: investment.maturityDate,
          indexer: investment.indexer,
          indexerValue: investment.indexerValue,
          instruction: investment.instruction,
        })),
      fgts: snapshot.fgts
        ? {
            enabled: snapshot.fgts.enabled,
            balance: snapshot.fgts.balance,
            firstWithdrawalMonth: snapshot.fgts.firstWithdrawalMonth,
            withdrawalEveryMonths: snapshot.fgts.withdrawalEveryMonths,
          }
        : null,
      reserveTargets: snapshot.reserveTargets.map((target) => ({
        effectiveFrom: target.effectiveFrom,
        months: target.months,
      })),
      savingsBoosts: snapshot.savingsBoosts.map((boost) => ({
        startsOn: boost.startsOn,
        endsOn: boost.endsOn,
        amount: boost.amount,
        note: boost.note,
      })),
      rates: snapshot.rates
        ? {
            selicAnnual: snapshot.rates.selicAnnual,
            cdiAnnual: snapshot.rates.cdiAnnual,
            ipcaAnnual: snapshot.rates.ipcaAnnual,
            referenceRateMonthly: snapshot.rates.referenceRateMonthly,
            capturedAt: snapshot.rates.capturedAt.toISOString(),
          }
        : null,
      months: projection.months.slice(0, MONTHS_AHEAD),
      previousReviews: history.map(({ review, suggestions }) => ({
        month: review.month,
        createdAt: review.createdAt.toISOString(),
        summary: review.summary,
        suggestions: suggestions.map((suggestion) => ({
          title: suggestion.title,
          rationale: suggestion.rationale,
          change: suggestion.change,
          status: suggestion.status,
          impact: suggestion.impact,
          decidedAt: suggestion.decidedAt?.toISOString() ?? null,
        })),
      })),
    });
  }

  /** O plano com as mudanças, sem gravar nada: antes × depois. */
  async simulate(
    planId: string,
    changes: readonly SuggestionChange[]
  ): Promise<Result<ProjectionImpact>> {
    const snapshot = await this.plans.loadSnapshot(planId);
    if (!snapshot) return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));

    const changed = applyChanges(snapshot, changes);
    if (!changed.ok) return changed;

    return ok(impactOf(this.project(snapshot), this.project(changed.value)));
  }

  /**
   * Grava a revisão do mês. O impacto de cada sugestão é medido aqui, sozinha
   * contra o plano de hoje — o número que aparece na tela é do motor, não do
   * texto do agente. Uma sugestão inválida derruba a revisão inteira: melhor o
   * agente corrigir do que você ver metade.
   */
  async submit(input: SubmitReviewInput): Promise<Result<ReviewWithSuggestions>> {
    const snapshot = await this.plans.loadSnapshot(input.planId);
    if (!snapshot) return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));

    const now = this.clock.now();
    const before = this.project(snapshot);
    const reviewId = this.ids.generate();

    const suggestions: PlanSuggestion[] = [];
    for (const [index, suggestion] of input.suggestions.entries()) {
      let impact: ProjectionImpact | null = null;
      if (suggestion.change.kind !== SuggestionKind.NOTE) {
        const changed = applyChanges(snapshot, [suggestion.change]);
        if (!changed.ok) {
          return err(
            new DomainError(
              changed.error.code,
              `Sugestão ${index + 1} ("${suggestion.title}"): ${changed.error.message}`
            )
          );
        }
        impact = impactOf(before, this.project(changed.value));
      }

      suggestions.push({
        id: this.ids.generate(),
        planId: input.planId,
        reviewId,
        title: suggestion.title,
        rationale: suggestion.rationale,
        change: suggestion.change,
        impact,
        status: SuggestionStatus.PENDING,
        sortOrder: index,
        createdAt: now,
        decidedAt: null,
      });
    }

    const review = {
      id: reviewId,
      planId: input.planId,
      month: monthOfISODate(this.clock.today()),
      summary: input.summary,
      createdAt: now,
    };
    await this.reviews.submit(review, suggestions);

    return ok({ review, suggestions });
  }

  /**
   * Você aceitou ou recusou. Aceitar grava a mudança no plano pelos mesmos
   * repositórios que /premissas e /metas usam; recusar só registra — e as duas
   * respostas voltam para o agente no mês seguinte.
   */
  async decide(
    planId: string,
    suggestionId: string,
    accept: boolean
  ): Promise<Result<PlanSuggestion>> {
    const suggestion = await this.reviews.findSuggestion(suggestionId);
    if (!suggestion || suggestion.planId !== planId) {
      return err(new DomainError("SUGGESTION_NOT_FOUND", "Sugestão não encontrada."));
    }
    if (suggestion.status !== SuggestionStatus.PENDING) {
      return err(new DomainError("SUGGESTION_ALREADY_DECIDED", "Essa sugestão já foi decidida."));
    }

    if (accept) {
      const applied = await this.apply(planId, suggestion.change);
      if (!applied.ok) return applied;
    }

    const decided: PlanSuggestion = {
      ...suggestion,
      status: accept ? SuggestionStatus.APPLIED : SuggestionStatus.DISMISSED,
      decidedAt: this.clock.now(),
    };
    await this.reviews.saveSuggestion(decided);
    return ok(decided);
  }

  async latest(planId: string): Promise<ReviewWithSuggestions | null> {
    const [latest] = await this.reviews.listRecent(planId, 1);
    return latest ?? null;
  }

  private async apply(planId: string, change: SuggestionChange): Promise<Result<void>> {
    switch (change.kind) {
      case SuggestionKind.SET_CATEGORY_BUDGET: {
        const category = await this.categories.findById(change.categoryId);
        if (!category || category.planId !== planId) {
          return err(new DomainError("CATEGORY_NOT_FOUND", "A categoria não existe mais."));
        }
        await this.categories.save({ ...category, monthlyBudget: change.monthlyBudget });
        return ok(undefined);
      }

      case SuggestionKind.MOVE_GOAL:
      case SuggestionKind.SET_GOAL_AMOUNT: {
        const goal = await this.goals.findById(change.goalId);
        if (!goal || goal.planId !== planId) {
          return err(new DomainError("GOAL_NOT_FOUND", "A meta não existe mais."));
        }
        await this.goals.save(
          change.kind === SuggestionKind.MOVE_GOAL
            ? { ...goal, targetMonth: change.targetMonth }
            : { ...goal, amount: change.amount }
        );
        return ok(undefined);
      }

      case SuggestionKind.SET_SAVINGS_BOOST: {
        const snapshot = await this.plans.loadSnapshot(planId);
        if (!snapshot) return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));
        await this.plans.replaceSavingsBoosts(
          planId,
          setBoostFrom(snapshot.savingsBoosts, change, {
            planId,
            newId: this.ids.generate(),
            note: "Revisão mensal",
          })
        );
        return ok(undefined);
      }

      case SuggestionKind.ADD_EXTRA_AMORTIZATION: {
        const financing = await this.financings.findByPlan(planId);
        if (!financing) {
          return err(new DomainError("NO_FINANCING", "O plano não tem financiamento."));
        }
        await this.financings.saveExtraAmortization({
          id: this.ids.generate(),
          financingId: financing.id,
          month: change.month,
          amount: change.amount,
        });
        return ok(undefined);
      }

      case SuggestionKind.NOTE:
        return ok(undefined);
    }
  }

  private project(snapshot: PlanSnapshot): ProjectionSummary {
    return projectPlan(buildProjectionInput(snapshot, this.clock.today(), DEFAULT_HORIZON_MONTHS));
  }
}
