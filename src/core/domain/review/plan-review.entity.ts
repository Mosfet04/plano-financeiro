import { GoalStatus } from "../goal/goal.entity";
import type { PlanSnapshot } from "../plan/plan-snapshot";
import { setBoostFrom } from "../plan/savings-boost.entity";
import type { ProjectionSummary } from "../projection/project-plan";
import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";
import { DomainError, err, ok, type Result } from "../shared/result";

/**
 * As alavancas que a revisão mensal pode puxar. Lista fechada de propósito: o
 * agente não escreve no banco, ele propõe uma destas e você aplica com um
 * toque. Mexer em renda, financiamento ou contas fica com você, em /premissas.
 */
export const SuggestionKind = {
  /** Orçamento de uma categoria: realista onde estoura sempre, mais justo onde sempre sobra. */
  SET_CATEGORY_BUDGET: "SET_CATEGORY_BUDGET",
  /** Mês de uma meta, ou nulo para tirá-la da conta. */
  MOVE_GOAL: "MOVE_GOAL",
  SET_GOAL_AMOUNT: "SET_GOAL_AMOUNT",
  /**
   * Reforço de meta: guardar X a mais por mês a partir de um mês. Substitui o
   * reforço dali para a frente; zero tira. É a alavanca da meta mais arrojada.
   */
  SET_SAVINGS_BOOST: "SET_SAVINGS_BOOST",
  /** Amortização do bolso num mês. Mesmo mês de novo sobrescreve, como em /premissas. */
  ADD_EXTRA_AMORTIZATION: "ADD_EXTRA_AMORTIZATION",
  /** Conselho sem mudança no plano: conferir uma caixinha, mudar dinheiro de conta. */
  NOTE: "NOTE",
} as const;
export type SuggestionKind = (typeof SuggestionKind)[keyof typeof SuggestionKind];

export type SuggestionChange =
  | {
      readonly kind: typeof SuggestionKind.SET_CATEGORY_BUDGET;
      readonly categoryId: string;
      readonly monthlyBudget: Cents;
    }
  | {
      readonly kind: typeof SuggestionKind.MOVE_GOAL;
      readonly goalId: string;
      readonly targetMonth: YearMonth | null;
    }
  | {
      readonly kind: typeof SuggestionKind.SET_GOAL_AMOUNT;
      readonly goalId: string;
      readonly amount: Cents;
    }
  | {
      readonly kind: typeof SuggestionKind.SET_SAVINGS_BOOST;
      readonly startsOn: YearMonth;
      readonly endsOn: YearMonth | null;
      readonly amount: Cents;
    }
  | {
      readonly kind: typeof SuggestionKind.ADD_EXTRA_AMORTIZATION;
      readonly month: YearMonth;
      readonly amount: Cents;
    }
  | { readonly kind: typeof SuggestionKind.NOTE };

export const SuggestionStatus = {
  PENDING: "PENDING",
  APPLIED: "APPLIED",
  DISMISSED: "DISMISSED",
  /** Uma revisão mais nova chegou antes de você decidir. */
  SUPERSEDED: "SUPERSEDED",
} as const;
export type SuggestionStatus = (typeof SuggestionStatus)[keyof typeof SuggestionStatus];

/** O que a mudança faz com os dois números que o plano existe para mexer. */
export interface ProjectionImpact {
  readonly payoffMonthBefore: YearMonth | null;
  readonly payoffMonthAfter: YearMonth | null;
  readonly minCashBefore: Cents;
  readonly minCashAfter: Cents;
  readonly minCashMonthAfter: YearMonth | null;
  readonly topUpBefore: Cents;
  readonly topUpAfter: Cents;
}

/**
 * A análise do mês: um texto curto e as sugestões. Cada revisão nova aposenta
 * as sugestões ainda pendentes das anteriores — o plano mudou desde então, e o
 * impacto delas foi medido contra um plano que não existe mais.
 */
export interface PlanReview {
  readonly id: string;
  readonly planId: string;
  readonly month: YearMonth;
  readonly summary: string;
  readonly createdAt: Date;
}

export interface PlanSuggestion {
  readonly id: string;
  readonly planId: string;
  readonly reviewId: string;
  readonly title: string;
  readonly rationale: string;
  readonly change: SuggestionChange;
  /**
   * Medido pelo servidor no momento da revisão, nunca o que o agente disse.
   * Nulo para NOTE, que não mexe na conta.
   */
  readonly impact: ProjectionImpact | null;
  readonly status: SuggestionStatus;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

export interface ReviewWithSuggestions {
  readonly review: PlanReview;
  readonly suggestions: readonly PlanSuggestion[];
}

export function impactOf(before: ProjectionSummary, after: ProjectionSummary): ProjectionImpact {
  return {
    payoffMonthBefore: before.payoffMonth,
    payoffMonthAfter: after.payoffMonth,
    minCashBefore: before.minCash,
    minCashAfter: after.minCash,
    minCashMonthAfter: after.minCashMonth,
    topUpBefore: before.monthlyTopUpToFixHole,
    topUpAfter: after.monthlyTopUpToFixHole,
  };
}

/**
 * O plano como ficaria com as mudanças, sem gravar nada. É o que deixa o
 * agente testar uma hipótese no motor de verdade, e o que mede o impacto de
 * cada sugestão antes de ela chegar à tela.
 *
 * Recusa id que não está no plano: o id vem de fora, e uma sugestão que mexe
 * em categoria de outro plano não pode nem ser simulada.
 */
export function applyChanges(
  snapshot: PlanSnapshot,
  changes: readonly SuggestionChange[]
): Result<PlanSnapshot> {
  let next = snapshot;

  for (const change of changes) {
    switch (change.kind) {
      case SuggestionKind.SET_CATEGORY_BUDGET: {
        if (!next.categories.some((category) => category.id === change.categoryId)) {
          return err(new DomainError("CATEGORY_NOT_FOUND", "Categoria não existe neste plano."));
        }
        if (change.monthlyBudget < 0) {
          return err(new DomainError("INVALID_AMOUNT", "Orçamento não pode ser negativo."));
        }
        next = {
          ...next,
          categories: next.categories.map((category) =>
            category.id === change.categoryId
              ? { ...category, monthlyBudget: change.monthlyBudget }
              : category
          ),
        };
        break;
      }

      case SuggestionKind.MOVE_GOAL:
      case SuggestionKind.SET_GOAL_AMOUNT: {
        const goal = next.goals.find((candidate) => candidate.id === change.goalId);
        if (!goal || goal.status !== GoalStatus.PLANNED) {
          return err(new DomainError("GOAL_NOT_FOUND", "Meta não existe ou não está planejada."));
        }
        if (change.kind === SuggestionKind.SET_GOAL_AMOUNT && change.amount <= 0) {
          return err(new DomainError("INVALID_AMOUNT", "O valor da meta tem de ser positivo."));
        }
        const updated =
          change.kind === SuggestionKind.MOVE_GOAL
            ? { ...goal, targetMonth: change.targetMonth }
            : { ...goal, amount: change.amount };
        next = {
          ...next,
          goals: next.goals.map((candidate) => (candidate.id === goal.id ? updated : candidate)),
        };
        break;
      }

      case SuggestionKind.SET_SAVINGS_BOOST: {
        if (change.amount < 0) {
          return err(new DomainError("INVALID_AMOUNT", "O reforço não pode ser negativo."));
        }
        if (change.endsOn !== null && change.endsOn < change.startsOn) {
          return err(new DomainError("INVALID_PERIOD", "O reforço termina antes de começar."));
        }
        next = {
          ...next,
          savingsBoosts: setBoostFrom(next.savingsBoosts, change, {
            planId: next.plan.id,
            newId: `simulado-${change.startsOn}`,
          }),
        };
        break;
      }

      case SuggestionKind.ADD_EXTRA_AMORTIZATION: {
        if (!next.financing) {
          return err(new DomainError("NO_FINANCING", "O plano não tem financiamento."));
        }
        if (change.amount <= 0) {
          return err(new DomainError("INVALID_AMOUNT", "A amortização tem de ser positiva."));
        }
        // Mesmo mês sobrescreve — é a regra do índice único em
        // (financing_id, month), e a simulação tem de concordar com o que
        // gravar vai fazer.
        next = {
          ...next,
          extraAmortizations: [
            ...next.extraAmortizations.filter((extra) => extra.month !== change.month),
            {
              id: `simulada-${change.month}`,
              financingId: next.financing.id,
              month: change.month,
              amount: change.amount,
            },
          ],
        };
        break;
      }

      case SuggestionKind.NOTE:
        break;
    }
  }

  return ok(next);
}
