import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";

/**
 * O resultado real de um mês que já acabou — o registro de "o plano previu ×
 * eu fiz".
 *
 * Fechar um mês é o que diz à projeção que ele é história: o caixa de hoje já
 * contém o resultado dele, então projetá-lo de novo somaria o mesmo dinheiro
 * duas vezes. É a versão precisa do que a data de conferência do saldo fazia
 * por aproximação.
 *
 * `leftover`, `planTarget` e `cash` são **histórico congelado**: o motor de
 * projeção não lê nenhum dos três. Ele só precisa saber *quais* meses fecharam.
 * Congelar em vez de recalcular é o ponto — daqui a um ano, mudar o orçamento
 * de mercado não pode reescrever o que setembro de 2026 foi.
 */
export interface MonthClosing {
  readonly id: string;
  readonly planId: string;
  readonly month: YearMonth;
  /** Sobra realizada: o que de fato entrou menos o que de fato saiu. */
  readonly leftover: Cents;
  /** O que o plano esperava deste mês, no momento em que ele foi fechado. */
  readonly planTarget: Cents;
  /** Caixa total no fechamento. Só para a série histórica. */
  readonly cash: Cents;
  readonly closedAt: Date;
  readonly note: string | null;
}

/** Sobra realizada menos a meta. Negativo = o mês fechou abaixo do previsto. */
export function closingSlack(closing: MonthClosing): Cents {
  return (closing.leftover - closing.planTarget) as Cents;
}

/**
 * Último mês fechado de uma lista — o corte entre história e projeção.
 * As linhas podem vir em qualquer ordem; quem decide é o mês, não a inserção.
 */
export function lastClosedMonth(closings: readonly MonthClosing[]): YearMonth | null {
  let latest: YearMonth | null = null;
  for (const closing of closings) {
    if (latest === null || closing.month > latest) latest = closing.month;
  }
  return latest;
}
