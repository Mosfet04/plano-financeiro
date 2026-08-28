import { PaymentMethod, type BudgetCategory } from "@/core/domain/budget/budget-category.entity";
import { ItemDirection, type RecurringItem } from "@/core/domain/expense/recurring-item.entity";
import { projectPlan } from "@/core/domain/projection/project-plan";
import {
  addCents,
  cents,
  maxCents,
  minCents,
  subCents,
  ZERO,
  type Cents,
} from "@/core/domain/shared/money";
import { daysInMonth, isWithin, monthOfISODate, type YearMonth } from "@/core/domain/shared/month";
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

  readonly salary: Cents;
  readonly extraIncome: Cents;
  readonly variableSpent: Cents;
  readonly goalSpent: Cents;
  /** O que estourou do vale-refeição e saiu do bolso. */
  readonly mealCardOverflow: Cents;
  readonly leftover: Cents;

  /** Sobra que a projeção espera deste mês, mais o reforço se o plano estiver furado. */
  readonly planTarget: Cents;
  readonly onPlan: boolean;
  /** Sobra menos meta. Negativo = o mês fecha abaixo do previsto. */
  readonly slack: Cents;

  readonly daysRemaining: number;
  readonly freePerDay: Cents;
  readonly leisurePerDay: Cents;
}

export interface CloseMonthInput {
  readonly planId: string;
  readonly month: YearMonth;
}

/**
 * Reproduz a aba "2. Meu mês": orçado × gasto, saldo do vale-refeição,
 * fechamento e o painel "posso gastar isso?".
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
        // Só gasto em dinheiro consome o orçamento: o que sai do vale-refeição
        // tem controle próprio.
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

    const mealCardSpent = spentBy((t) => t.paymentMethod === PaymentMethod.MEAL_CARD);
    const mealCardRemaining = subCents(snapshot.income.mealCardMonthly, mealCardSpent);
    const mealCardOverflow = maxCents(cents(-mealCardRemaining), ZERO);

    const extraIncome = spentBy((t) => t.kind === TransactionKind.EXTRA_INCOME);
    const variableSpent = addCents(...categories.map((c) => c.spent));
    const goalSpent = spentBy((t) => t.kind === TransactionKind.GOAL);

    const leftover = cents(
      snapshot.income.netSalary +
        extraIncome -
        fixedTotal -
        variableSpent -
        goalSpent -
        mealCardOverflow
    );

    // Meta do mês: o que a projeção espera de sobra, mais o reforço necessário
    // caso alguma meta tenha furado o caixa do plano.
    const projection = projectPlan(buildProjectionInput(snapshot, today, DEFAULT_HORIZON_MONTHS));
    const projected =
      projection.months.find((m) => m.month === input.month)?.leftover ??
      projection.leftoverFirstMonth;
    const planTarget = addCents(projected, projection.monthlyTopUpToFixHole);
    const slack = subCents(leftover, planTarget);

    const daysRemaining =
      monthOfISODate(today) === input.month
        ? Math.max(1, daysInMonth(input.month) - Number(today.slice(8, 10)) + 1)
        : daysInMonth(input.month);

    const positiveSlack = maxCents(slack, ZERO);
    const leisure = categories.find((c) => /lazer/i.test(c.category.name));

    return ok({
      month: input.month,
      transactions: entries,
      categories,
      fixedBills,
      fixedTotal,
      mealCardCredited: snapshot.income.mealCardMonthly,
      mealCardSpent,
      mealCardRemaining,
      salary: snapshot.income.netSalary,
      extraIncome,
      variableSpent,
      goalSpent,
      mealCardOverflow,
      leftover,
      planTarget,
      onPlan: leftover >= planTarget,
      slack,
      daysRemaining,
      freePerDay: cents(positiveSlack / daysRemaining),
      // O rolê tem que caber nos dois: no orçamento de lazer e na folga da meta.
      leisurePerDay: leisure
        ? cents(minCents(maxCents(leisure.remaining, ZERO), positiveSlack) / daysRemaining)
        : cents(positiveSlack / daysRemaining),
    });
  }
}
