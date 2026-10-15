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

/**
 * A meta depois de um pagamento lançado em `paymentMonth`, ou nulo quando nada
 * muda.
 *
 * Meta paga fora do mês dela vai para o mês do pagamento: é nele que o dinheiro
 * saiu. Parada no mês antigo, o pagamento contava como gasto comum no mês em
 * que saiu (que fechava no vermelho) e a projeção descontava a meta de novo no
 * mês previsto.
 *
 * Não move quando a meta já tem pagamento no mês dela: aí é parcela, e mover
 * levaria junto o que já foi pago. O restante de uma meta paga em partes é
 * separado na virada (`resolvePendingGoal`).
 */
export function goalMovedByPayment(
  goal: Goal,
  paymentMonth: YearMonth,
  paidInItsMonth: boolean
): Goal | null {
  if (goal.status !== GoalStatus.PLANNED) return null;
  if (goal.targetMonth === paymentMonth || paidInItsMonth) return null;
  return { ...goal, targetMonth: paymentMonth };
}

/** Meta do mês ainda planejada com valor por lançar — a pergunta da virada. */
export interface PendingGoal {
  readonly goal: Goal;
  /** Lançado no mês contra a meta. */
  readonly launched: Cents;
  /** Previsto − lançado. */
  readonly remaining: Cents;
}

export const PendingGoalResolution = {
  /** Paga: o que foi lançado é o que custou. */
  DONE: "DONE",
  /** O que falta sai no mês seguinte. */
  CARRY: "CARRY",
} as const;
export type PendingGoalResolution =
  (typeof PendingGoalResolution)[keyof typeof PendingGoalResolution];

/**
 * As metas a gravar quando a virada responde por uma meta pendente.
 *
 * Levar o restante sem nada pago move a meta inteira. Com parte paga, divide:
 * a meta fica no mês com o valor lançado, já concluída, e o restante vira uma
 * meta nova no mês seguinte — é o depósito do cartório no protocolo e o resto
 * no registro.
 */
export function resolvePendingGoal(
  pending: PendingGoal,
  resolution: PendingGoalResolution,
  nextMonth: YearMonth,
  newId: string
): Goal[] {
  const { goal, launched, remaining } = pending;

  if (resolution === PendingGoalResolution.DONE) {
    return [{ ...goal, status: GoalStatus.DONE }];
  }
  if (launched <= 0) {
    return [{ ...goal, targetMonth: nextMonth }];
  }
  return [
    { ...goal, amount: launched, status: GoalStatus.DONE },
    {
      ...goal,
      id: newId,
      name: `${goal.name} (restante)`,
      amount: remaining,
      targetMonth: nextMonth,
      status: GoalStatus.PLANNED,
    },
  ];
}
