import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import {
  SuggestionKind,
  SuggestionStatus,
  type PlanSuggestion,
  type ProjectionImpact,
} from "@/core/domain/review/plan-review.entity";
import { formatBRL } from "@/core/domain/shared/money";
import { formatMonth } from "@/core/domain/shared/month";

export interface SuggestionView {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  /** "Mercado: R$ 800,00 → R$ 950,00". Nulo para conselho sem mudança. */
  readonly change: string | null;
  readonly impact: readonly string[];
  readonly status: SuggestionStatus;
}

/**
 * A mudança dita com os nomes e valores de hoje. O "de" vem do plano atual,
 * não de quando a sugestão foi feita — é o que vai mudar se você aplicar.
 */
function describeChange(suggestion: PlanSuggestion, snapshot: PlanSnapshot): string | null {
  const change = suggestion.change;
  switch (change.kind) {
    case SuggestionKind.SET_CATEGORY_BUDGET: {
      const category = snapshot.categories.find((c) => c.id === change.categoryId);
      const from = category ? `${formatBRL(category.monthlyBudget)} → ` : "";
      return `Orçamento de ${category?.name ?? "categoria removida"}: ${from}${formatBRL(change.monthlyBudget)}`;
    }
    case SuggestionKind.MOVE_GOAL: {
      const goal = snapshot.goals.find((g) => g.id === change.goalId);
      const from = goal?.targetMonth ? formatMonth(goal.targetMonth) : "sem data";
      const to = change.targetMonth ? formatMonth(change.targetMonth) : "sem data";
      return `${goal?.name ?? "Meta removida"}: ${from} → ${to}`;
    }
    case SuggestionKind.SET_GOAL_AMOUNT: {
      const goal = snapshot.goals.find((g) => g.id === change.goalId);
      const from = goal ? `${formatBRL(goal.amount)} → ` : "";
      return `${goal?.name ?? "Meta removida"}: ${from}${formatBRL(change.amount)}`;
    }
    case SuggestionKind.ADD_EXTRA_AMORTIZATION:
      return `Amortizar ${formatBRL(change.amount)} em ${formatMonth(change.month)}, do caixa de quitação`;
    case SuggestionKind.NOTE:
      return null;
  }
}

/** Só o que muda: "Quitação set/2030 → ago/2030". Nada muda = uma linha dizendo isso. */
function describeImpact(impact: ProjectionImpact | null): string[] {
  if (!impact) return [];
  const lines: string[] = [];
  const month = (value: ProjectionImpact["payoffMonthBefore"]) =>
    value ? formatMonth(value) : "fora do horizonte";

  if (impact.payoffMonthBefore !== impact.payoffMonthAfter) {
    lines.push(`Quitação ${month(impact.payoffMonthBefore)} → ${month(impact.payoffMonthAfter)}`);
  }
  if (impact.minCashBefore !== impact.minCashAfter) {
    lines.push(
      `Menor caixa ${formatBRL(impact.minCashBefore)} → ${formatBRL(impact.minCashAfter)}`
    );
  }
  if (impact.topUpBefore !== impact.topUpAfter) {
    lines.push(`Reforço mensal ${formatBRL(impact.topUpBefore)} → ${formatBRL(impact.topUpAfter)}`);
  }
  return lines.length > 0 ? lines : ["Não muda quitação nem menor caixa"];
}

export function toSuggestionView(
  suggestion: PlanSuggestion,
  snapshot: PlanSnapshot
): SuggestionView {
  return {
    id: suggestion.id,
    title: suggestion.title,
    rationale: suggestion.rationale,
    change: describeChange(suggestion, snapshot),
    impact: describeImpact(suggestion.impact),
    status: suggestion.status,
  };
}
