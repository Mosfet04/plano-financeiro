import type { Cents } from "../shared/money";
import { addMonths, endOfMonthDate, monthOfISODate, type YearMonth } from "../shared/month";

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

/**
 * O mês já acabou e pode ser fechado: é anterior ao corrente, ou hoje é o
 * último dia dele.
 *
 * O último dia entra porque é quando o salário costuma cair e a sobra vai para
 * as caixinhas. Antes disso, fechar congelaria um número que ainda vai mudar e
 * tiraria da projeção uma sobra que ainda está por vir.
 */
export function isMonthOver(month: YearMonth, today: string): boolean {
  const current = monthOfISODate(today);
  if (month < current) return true;
  return month === current && today === endOfMonthDate(month);
}

/**
 * O mês cuja virada está pendente, ou nulo. É o que os avisos de /resumo e
 * /mes oferecem.
 *
 * Só o mês que acabou de terminar: o corrente no último dia, ou o anterior
 * depois disso. Um mês velho que ficou aberto não volta a pedir virada; os
 * saldos de hoje já contêm o resultado dele, e fechar o mês mais recente
 * resolve a projeção.
 */
export function pendingTurnover(
  today: string,
  closings: readonly MonthClosing[],
  planStartMonth: YearMonth
): YearMonth | null {
  const current = monthOfISODate(today);
  const candidate = isMonthOver(current, today) ? current : addMonths(current, -1);

  if (candidate < planStartMonth) return null;
  if (closings.some((closing) => closing.month === candidate)) return null;
  return candidate;
}
