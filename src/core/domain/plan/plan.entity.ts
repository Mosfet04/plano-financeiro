import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";

export interface Plan {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  /** Primeiro mês da projeção. */
  readonly startMonth: YearMonth;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Renda do titular. Só o salário mora aqui — qualquer outra entrada recorrente
 * (auxílio home office, renda de aluguel) é um `RecurringItem` de direção INCOME,
 * para poder ter data de início e fim.
 */
export interface IncomeSettings {
  readonly planId: string;
  readonly grossSalary: Cents;
  readonly netSalary: Cents;
  /** Reajuste anual como decimal: 0.05 = 5%. */
  readonly annualRaise: number;
  /** Mês em que o reajuste é aplicado (1 = janeiro). */
  readonly raiseMonth: number;
  /** Vale-refeição/alimentação mensal. Não é dinheiro livre: só paga comida. */
  readonly mealCardMonthly: Cents;

  readonly thirteenthNet: Cents;
  /** Meses em que o 13º é pago, rateado igualmente entre eles. Ex.: [11, 12]. */
  readonly thirteenthMonths: readonly number[];

  readonly vacationBonus: Cents;
  readonly vacationMonth: number;

  /** PLR em múltiplos do salário bruto. O IR sai da tabela exclusiva de PLR. */
  readonly plrGrossSalaries: number;
  readonly plrMonth: number;
}

/**
 * Alvo da reserva de emergência, versionado por data de vigência: hoje 3 meses
 * de custo de vida, 6 meses a partir de 2028.
 */
export interface ReserveTarget {
  readonly id: string;
  readonly planId: string;
  readonly effectiveFrom: YearMonth;
  readonly months: number;
}

export const YieldMode = {
  /** Percentual fixo digitado por você. */
  MANUAL: "MANUAL",
  /** Derivado do CDI do último snapshot — é o que faz a rotina de quinta mexer na projeção. */
  CDI_LINKED: "CDI_LINKED",
} as const;
export type YieldMode = (typeof YieldMode)[keyof typeof YieldMode];

export interface YieldPolicy {
  readonly planId: string;
  readonly mode: YieldMode;
  /** Usado quando o modo é MANUAL. Decimal ao ano: 0.11 = 11% líquidos. */
  readonly manualAnnualNet: number;
  /** Usado quando o modo é CDI_LINKED. 1.0 = 100% do CDI. */
  readonly cdiPercent: number;
  /** Alíquota de IR aplicada sobre o rendimento bruto no modo CDI_LINKED. */
  readonly incomeTaxRate: number;
}
