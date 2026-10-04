import { minCents, ZERO, type Cents } from "../shared/money";
import { addMonths, isBefore, isWithin, type YearMonth } from "../shared/month";

/**
 * Reforço de meta: quanto guardar a mais por mês, além da sobra que o
 * orçamento já deixa. É o compromisso de gastar menos do que as categorias
 * permitem, sem dizer em qual delas — a meta sobe e o "quanto dá para gastar
 * hoje" desce na mesma medida.
 *
 * Existe porque a meta é derivada (renda − despesas − orçamento − metas): sem
 * isto, a única forma de pedir mais esforço era cortar uma categoria
 * específica. Quem bate a meta com folga mês após mês tem dinheiro que o plano
 * não está mandando para a quitação.
 */
export interface SavingsBoost {
  readonly id: string;
  readonly planId: string;
  /** "YYYY-MM" — primeiro mês em que vale. */
  readonly startsOn: YearMonth;
  /** "YYYY-MM" — último mês em que vale; nulo = até mudar. */
  readonly endsOn: YearMonth | null;
  readonly amount: Cents;
  readonly note: string | null;
}

/**
 * Reforço em vigor no mês. Nunca passa do orçamento variável: guardar mais do
 * que o orçamento de gasto seria prometer gasto negativo.
 */
export function boostFor(
  boosts: readonly SavingsBoost[],
  month: YearMonth,
  variableBudget: Cents
): Cents {
  let total = 0;
  for (const boost of boosts) {
    if (isWithin(month, boost.startsOn, boost.endsOn)) total += boost.amount;
  }
  return minCents(total as Cents, variableBudget > 0 ? variableBudget : ZERO);
}

export interface BoostChange {
  readonly startsOn: YearMonth;
  readonly endsOn: YearMonth | null;
  /** Zero tira o reforço a partir de `startsOn`. */
  readonly amount: Cents;
}

/**
 * "A partir de `startsOn`, o reforço é X." Substitui tudo dali para a frente:
 * o que começava depois some, o que estava em vigor termina no mês anterior. É
 * a regra que deixa subir, baixar e zerar com a mesma operação — e que a
 * simulação e a gravação compartilham, para nunca discordarem.
 */
export function setBoostFrom(
  boosts: readonly SavingsBoost[],
  change: BoostChange,
  ids: { planId: string; newId: string; note?: string | null }
): SavingsBoost[] {
  const lastBefore = addMonths(change.startsOn, -1);
  const kept: SavingsBoost[] = [];

  for (const boost of boosts) {
    if (!isBefore(boost.startsOn, change.startsOn)) continue;
    const endsBefore = boost.endsOn !== null && isBefore(boost.endsOn, change.startsOn);
    kept.push(endsBefore ? boost : { ...boost, endsOn: lastBefore });
  }

  if (change.amount > 0) {
    kept.push({
      id: ids.newId,
      planId: ids.planId,
      startsOn: change.startsOn,
      endsOn: change.endsOn,
      amount: change.amount,
      note: ids.note ?? null,
    });
  }

  return kept;
}
