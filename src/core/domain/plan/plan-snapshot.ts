import type { BudgetCategory } from "../budget/budget-category.entity";
import type { RecurringItem } from "../expense/recurring-item.entity";
import type { ExtraAmortization, Financing } from "../financing/financing.entity";
import type { Goal } from "../goal/goal.entity";
import type { Investment } from "../investment/investment.entity";
import type { MarketRatesSnapshot } from "../market/market-rates.entity";
import type { IncomeSettings, Plan, ReserveTarget, YieldPolicy } from "./plan.entity";

/**
 * Tudo que o motor de projeção precisa, carregado de uma vez. Existe para o
 * caso de uso não fazer sete idas ao banco só para desenhar uma tela.
 */
export interface PlanSnapshot {
  readonly plan: Plan;
  readonly income: IncomeSettings;
  readonly yieldPolicy: YieldPolicy;
  readonly accrueInvestments: boolean;
  readonly recurringItems: readonly RecurringItem[];
  readonly categories: readonly BudgetCategory[];
  readonly goals: readonly Goal[];
  readonly financing: Financing | null;
  readonly extraAmortizations: readonly ExtraAmortization[];
  readonly investments: readonly Investment[];
  readonly reserveTargets: readonly ReserveTarget[];
  readonly rates: MarketRatesSnapshot | null;
}
