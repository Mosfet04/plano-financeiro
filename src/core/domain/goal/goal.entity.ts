import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";

export const GoalStatus = {
  PLANNED: "PLANNED",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];

/**
 * Meta com data. Entra na projeção como gasto único no `targetMonth`.
 * Sem data (targetMonth nulo) a meta existe como intenção, mas não afeta a conta
 * — é o caso de "quitar o apartamento", cujo valor é o saldo devedor do dia.
 */
export interface Goal {
  readonly id: string;
  readonly planId: string;
  readonly name: string;
  readonly amount: Cents;
  readonly targetMonth: YearMonth | null;
  /** De onde sai o dinheiro, em texto livre: "PLR de março", "13º + caixa". */
  readonly fundingSource: string | null;
  readonly note: string | null;
  readonly status: GoalStatus;
  readonly sortOrder: number;
}
