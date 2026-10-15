import { PaymentMethod } from "../budget/budget-category.entity";
import { GoalStatus, type Goal, type PendingGoal } from "../goal/goal.entity";
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

export interface GoalSpending {
  /** Tudo que foi lançado como meta no mês. */
  readonly launched: Cents;
  /** O que as metas tiram da sobra realizada. */
  readonly committed: Cents;
  /** Metas do mês ainda planejadas com valor por lançar. */
  readonly pending: readonly PendingGoal[];
}

/**
 * Quanto as metas tiram da sobra realizada do mês — a mesma regra do Dinheiro.
 *
 * - Meta do mês planejada: o maior entre o previsto e o lançado. O previsto já
 *   está comprometido; contar só o lançado dava folga de R$ 19 mil enquanto o
 *   ITBI não saía, e ela sumia no dia do pagamento.
 * - Meta do mês concluída: o lançado, que é o que custou. Sem lançamento, o
 *   previsto — concluir sem lançar não pode virar folga.
 * - Lançamento de meta de outro mês, ou sem meta: inteiro, é dinheiro que saiu.
 */
export function goalSpending(
  transactions: readonly Transaction[],
  goals: readonly Goal[],
  month: YearMonth
): GoalSpending {
  const ofMonth = goals.filter(
    (goal) => goal.targetMonth === month && goal.status !== GoalStatus.CANCELLED
  );
  const ofMonthIds = new Set(ofMonth.map((goal) => goal.id));

  const paidBy = new Map<string, number>();
  let launched = 0;
  let outsideMonth = 0;
  for (const transaction of transactions) {
    if (transaction.kind !== TransactionKind.GOAL) continue;
    launched += transaction.amount;
    if (transaction.goalId && ofMonthIds.has(transaction.goalId)) {
      paidBy.set(transaction.goalId, (paidBy.get(transaction.goalId) ?? 0) + transaction.amount);
    } else {
      outsideMonth += transaction.amount;
    }
  }

  let committed = outsideMonth;
  const pending: PendingGoal[] = [];
  for (const goal of ofMonth) {
    const paid = paidBy.get(goal.id) ?? 0;
    if (goal.status === GoalStatus.DONE) {
      committed += paid > 0 ? paid : goal.amount;
      continue;
    }
    committed += Math.max(goal.amount, paid);
    if (paid < goal.amount) {
      pending.push({ goal, launched: cents(paid), remaining: cents(goal.amount - paid) });
    }
  }

  return { launched: cents(launched), committed: cents(committed), pending };
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
