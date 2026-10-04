import { PaymentMethod } from "../budget/budget-category.entity";
import { GoalStatus, type Goal } from "../goal/goal.entity";
import { addCents, cents, maxCents, minCents, subCents, ZERO, type Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";
import { TransactionKind, type Transaction } from "../transaction/transaction.entity";

/** Gasto de uma fonte, cortado em hoje. */
export interface DaySplit {
  readonly beforeToday: Cents;
  readonly today: Cents;
}

export interface SpendingBySource {
  readonly cash: DaySplit;
  readonly mealCard: DaySplit;
}

const EMPTY: DaySplit = { beforeToday: ZERO, today: ZERO };

function add(split: DaySplit, amount: Cents, isToday: boolean): DaySplit {
  return isToday
    ? { ...split, today: addCents(split.today, amount) }
    : { ...split, beforeToday: addCents(split.beforeToday, amount) };
}

/**
 * Gasto bruto do mês por fonte, antes de mover o estouro do VA.
 *
 * Lançamento de meta conta no Dinheiro só no que passa da meta prevista para o
 * mês: o previsto já saiu do orçamento como "gasto que vai entrar", e contar o
 * lançado de novo seria cobrar o ITBI duas vezes. Meta concluída no mês continua
 * cobrindo os próprios lançamentos. Data futura conta como hoje — é dinheiro já
 * comprometido.
 */
export function spendingByDay(
  transactions: readonly Transaction[],
  goals: readonly Goal[],
  month: YearMonth,
  today: string
): SpendingBySource {
  const coverage = new Map<string, number>(
    goals
      .filter((goal) => goal.targetMonth === month && goal.status !== GoalStatus.CANCELLED)
      .map((goal) => [goal.id, goal.amount])
  );

  let cash = EMPTY;
  let mealCard = EMPTY;

  const ordered = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime()
  );

  for (const transaction of ordered) {
    const isToday = transaction.date >= today;

    if (transaction.kind === TransactionKind.GOAL) {
      const available = coverage.get(transaction.goalId ?? "") ?? 0;
      const covered = Math.min(available, transaction.amount);
      if (transaction.goalId) coverage.set(transaction.goalId, available - covered);
      const uncovered = cents(transaction.amount - covered);
      if (uncovered > 0) cash = add(cash, uncovered, isToday);
    } else if (transaction.kind === TransactionKind.EXPENSE) {
      if (transaction.paymentMethod === PaymentMethod.MEAL_CARD) {
        mealCard = add(mealCard, transaction.amount, isToday);
      } else {
        cash = add(cash, transaction.amount, isToday);
      }
    }
  }

  return { cash, mealCard };
}

/**
 * O VA para no crédito: o que passa dele sai do bolso, e entra no Dinheiro no
 * dia em que estourou.
 */
export function moveMealCardOverflow(raw: SpendingBySource, credit: Cents): SpendingBySource {
  const total = addCents(raw.mealCard.beforeToday, raw.mealCard.today);
  const overflowBefore = maxCents(subCents(raw.mealCard.beforeToday, credit), ZERO);
  const overflowToday = subCents(maxCents(subCents(total, credit), ZERO), overflowBefore);

  return {
    cash: {
      beforeToday: addCents(raw.cash.beforeToday, overflowBefore),
      today: addCents(raw.cash.today, overflowToday),
    },
    mealCard: {
      beforeToday: minCents(raw.mealCard.beforeToday, credit),
      today: subCents(raw.mealCard.today, overflowToday),
    },
  };
}
