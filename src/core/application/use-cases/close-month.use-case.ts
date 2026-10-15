import { PaymentMethod, type BudgetCategory } from "@/core/domain/budget/budget-category.entity";
import { ItemDirection, type RecurringItem } from "@/core/domain/expense/recurring-item.entity";
import {
  expectedMonthRow,
  projectPlan,
  type MonthProjection,
} from "@/core/domain/projection/project-plan";
import { addCents, cents, maxCents, subCents, ZERO, type Cents } from "@/core/domain/shared/money";
import {
  endOfMonthDate,
  isWithin,
  monthOfISODate,
  type YearMonth,
} from "@/core/domain/shared/month";
import { dailyAllowance, type DailyAllowance } from "@/core/domain/spending/daily-allowance";
import type { PendingGoal } from "@/core/domain/goal/goal.entity";
import {
  goalSpending,
  moveMealCardOverflow,
  spendingByDay,
  type SpendingBySource,
} from "@/core/domain/spending/month-ledger";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";
import { TransactionKind, type Transaction } from "@/core/domain/transaction/transaction.entity";

import type { Clock, PlanRepository, TransactionRepository } from "../ports";
import { buildProjectionInput, DEFAULT_HORIZON_MONTHS } from "./get-projection.use-case";

export interface CategorySpending {
  readonly category: BudgetCategory;
  readonly budget: Cents;
  readonly spent: Cents;
  readonly remaining: Cents;
  /** Fração do orçamento usada. Pode passar de 1 quando estoura. */
  readonly usedRatio: number;
}

export interface FixedBillStatus {
  readonly item: RecurringItem;
  readonly amount: Cents;
  readonly dueDay: number | null;
}

export interface CloseMonthOutput {
  readonly month: YearMonth;
  readonly transactions: readonly Transaction[];
  readonly categories: readonly CategorySpending[];
  readonly fixedBills: readonly FixedBillStatus[];
  readonly fixedTotal: Cents;

  /** Vale-refeição: entrou, gastou, sobrou. */
  readonly mealCardCredited: Cents;
  readonly mealCardSpent: Cents;
  readonly mealCardRemaining: Cents;

  /** Renda prevista do mês: salário, 13º, PLR e abono de férias, como na projeção. */
  readonly income: Cents;
  /** Moradia com a parcela, já abatidas as entradas do grupo (auxílio home office). */
  readonly housing: Cents;
  readonly otherFixed: Cents;
  readonly extraIncome: Cents;
  readonly variableSpent: Cents;
  /** Lançado como meta no mês. */
  readonly goalSpent: Cents;
  /**
   * O que as metas tiram da sobra: o previsto das metas do mês ainda não pagas
   * conta como já saído (`goalSpending`).
   */
  readonly goalCommitted: Cents;
  /** Metas do mês ainda planejadas com valor por lançar. */
  readonly pendingGoals: readonly PendingGoal[];
  /** O que estourou do vale-refeição e saiu do bolso. */
  readonly mealCardOverflow: Cents;
  readonly leftover: Cents;

  /** Sobra que a projeção espera deste mês, mais o reforço se o plano estiver furado. */
  readonly planTarget: Cents;
  /** A parte da meta que é reforço voluntário (`SavingsBoost`), já somada em `planTarget`. */
  readonly savingsBoost: Cents;
  readonly onPlan: boolean;
  /** Sobra menos meta. Negativo = o mês fecha abaixo do previsto. */
  readonly slack: Cents;

  /** Gasto do mês por fonte, cortado em hoje, antes de o estouro do VA ir para o Dinheiro. */
  readonly rawSpending: SpendingBySource;
  /** Quanto dá para gastar hoje, por fonte. Num mês que já passou, vale o último dia. */
  readonly allowance: {
    readonly cash: DailyAllowance;
    readonly mealCard: DailyAllowance;
  };
}

export interface CloseMonthInput {
  readonly planId: string;
  readonly month: YearMonth;
}

/**
 * Reproduz a aba "2. Meu mês": orçado × gasto, saldo do VA, fechamento e o
 * quanto dá para gastar hoje.
 *
 * O lado do mês que não depende de lançamento — renda, moradia, parcela,
 * contas fixas — vem da mesma linha da projeção que dá a meta. Se viesse de
 * outra conta, a folga mediria a diferença entre as duas contas, não o gasto:
 * era isso que zerava novembro (o 13º estava só na meta).
 */
export class CloseMonthUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly transactions: TransactionRepository,
    private readonly clock: Clock
  ) {}

  async execute(input: CloseMonthInput): Promise<Result<CloseMonthOutput>> {
    const snapshot = await this.plans.loadSnapshot(input.planId);
    if (!snapshot) {
      return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));
    }

    const today = this.clock.today();
    const entries = await this.transactions.listByMonth(input.planId, input.month);

    const spentBy = (predicate: (t: Transaction) => boolean): Cents =>
      addCents(...entries.filter(predicate).map((t) => t.amount));

    const categories: CategorySpending[] = snapshot.categories
      .filter((category) => category.active)
      .map((category) => {
        // Só gasto em dinheiro consome o orçamento: o VA tem controle próprio.
        const spent = spentBy(
          (t) =>
            t.kind === TransactionKind.EXPENSE &&
            t.categoryId === category.id &&
            t.paymentMethod === PaymentMethod.CASH
        );
        return {
          category,
          budget: category.monthlyBudget,
          spent,
          remaining: subCents(category.monthlyBudget, spent),
          usedRatio: category.monthlyBudget === 0 ? 0 : spent / category.monthlyBudget,
        };
      });

    const fixedBills: FixedBillStatus[] = snapshot.recurringItems
      .filter(
        (item) =>
          item.active &&
          item.direction === ItemDirection.EXPENSE &&
          isWithin(input.month, item.startsOn, item.endsOn)
      )
      .sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99))
      .map((item) => ({ item, amount: item.amount, dueDay: item.dueDay }));

    const fixedTotal = addCents(...fixedBills.map((bill) => bill.amount));

    const projectionInput = buildProjectionInput(snapshot, today, DEFAULT_HORIZON_MONTHS);
    const topUp = projectPlan(projectionInput).monthlyTopUpToFixHole;
    const expected =
      expectedMonthRow(projectionInput, input.month) ?? fallbackRow(snapshot, fixedTotal);

    const credit = snapshot.income.mealCardMonthly;
    const mealCardSpent = spentBy(
      (t) => t.kind === TransactionKind.EXPENSE && t.paymentMethod === PaymentMethod.MEAL_CARD
    );
    const mealCardRemaining = subCents(credit, mealCardSpent);
    const mealCardOverflow = maxCents(cents(-mealCardRemaining), ZERO);

    const extraIncome = spentBy((t) => t.kind === TransactionKind.EXTRA_INCOME);
    const variableSpent = spentBy(
      (t) => t.kind === TransactionKind.EXPENSE && t.paymentMethod === PaymentMethod.CASH
    );
    const goals = goalSpending(entries, snapshot.goals, input.month);

    const leftover = cents(
      expected.income -
        expected.housing -
        expected.otherFixed +
        extraIncome -
        variableSpent -
        goals.committed -
        mealCardOverflow
    );

    // Meta do mês: a sobra que o plano espera dele, mais o reforço que fecha o
    // buraco do caixa.
    const planTarget = addCents(expected.leftover, topUp);
    const slack = subCents(leftover, planTarget);

    // Dinheiro do mês = entradas − o que ainda vai sair (moradia, parcela,
    // contas, metas) − o que o plano manda guardar. Algebricamente é a soma das
    // categorias menos o reforço, mais a renda extra.
    const cashBudget = cents(
      expected.income +
        extraIncome -
        expected.housing -
        expected.otherFixed -
        expected.goals -
        planTarget
    );

    // Num mês que já passou, o "hoje" é o último dia dele.
    const asOf = monthOfISODate(today) === input.month ? today : endOfMonthDate(input.month);
    const rawSpending = spendingByDay(entries, snapshot.goals, input.month, asOf);
    const spending = moveMealCardOverflow(rawSpending, credit);

    return ok({
      month: input.month,
      transactions: entries,
      categories,
      fixedBills,
      fixedTotal,
      mealCardCredited: credit,
      mealCardSpent,
      mealCardRemaining,
      income: expected.income,
      housing: expected.housing,
      otherFixed: expected.otherFixed,
      extraIncome,
      variableSpent,
      goalSpent: goals.launched,
      goalCommitted: goals.committed,
      pendingGoals: goals.pending,
      mealCardOverflow,
      leftover,
      planTarget,
      savingsBoost: expected.savingsBoost,
      onPlan: leftover >= planTarget,
      slack,
      rawSpending,
      allowance: {
        cash: dailyAllowance({
          monthBudget: cashBudget,
          spentBeforeToday: spending.cash.beforeToday,
          spentToday: spending.cash.today,
          today: asOf,
        }),
        mealCard: dailyAllowance({
          monthBudget: credit,
          spentBeforeToday: spending.mealCard.beforeToday,
          spentToday: spending.mealCard.today,
          today: asOf,
        }),
      },
    });
  }
}

/** Mês anterior ao plano não tem linha projetada: só salário e contas fixas. */
function fallbackRow(
  snapshot: { income: { netSalary: Cents }; categories: readonly BudgetCategory[] },
  fixedTotal: Cents
): Pick<
  MonthProjection,
  "income" | "housing" | "otherFixed" | "goals" | "savingsBoost" | "leftover"
> {
  const variable = addCents(
    ...snapshot.categories.filter((c) => c.active).map((c) => c.monthlyBudget)
  );
  return {
    income: snapshot.income.netSalary,
    housing: ZERO,
    otherFixed: fixedTotal,
    goals: ZERO,
    savingsBoost: ZERO,
    leftover: cents(snapshot.income.netSalary - fixedTotal - variable),
  };
}
