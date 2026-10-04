import type { CategoryIcon, PaymentMethod } from "@/core/domain/budget/budget-category.entity";
import { pendingTurnover } from "@/core/domain/closing/month-closing.entity";
import type { AmortizationVerdict } from "@/core/domain/projection/amortization-advice";
import { addCents, subCents, type Cents } from "@/core/domain/shared/money";
import {
  addMonths,
  daysBetweenDates,
  monthOfISODate,
  type YearMonth,
} from "@/core/domain/shared/month";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";
import type { DailyAllowance } from "@/core/domain/spending/daily-allowance";
import type { SpendingBySource } from "@/core/domain/spending/month-ledger";
import { TransactionKind, type Transaction } from "@/core/domain/transaction/transaction.entity";

import type { BudgetCategoryRepository, Clock, IdGenerator, TransactionRepository } from "../ports";
import type { CloseMonthUseCase } from "./close-month.use-case";
import type { GetProjectionUseCase } from "./get-projection.use-case";

/** Tudo o que o relógio mostra, numa chamada só. */
export interface WatchSnapshot {
  readonly today: string;
  readonly month: YearMonth;
  readonly cash: DailyAllowance;
  readonly mealCard: DailyAllowance;
  /**
   * O que o relógio precisa para refazer a conta sozinho: na virada da
   * meia-noite sem rede, e com lançamentos ainda na fila.
   */
  readonly ledger: SpendingBySource & { readonly mealCardCredit: Cents };
  readonly nextMonth: {
    readonly month: YearMonth;
    readonly cashBudget: Cents;
    readonly mealCardBudget: Cents;
  };
  readonly categories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly icon: CategoryIcon;
    readonly defaultPaymentMethod: PaymentMethod;
    readonly budget: Cents;
    readonly cashSpent: Cents;
    readonly mealCardSpent: Cents;
  }>;
  readonly plan: {
    readonly payoffMonth: YearMonth | null;
    readonly minCash: Cents;
    readonly minCashMonth: YearMonth | null;
    readonly monthlyTopUp: Cents;
    readonly pendingTurnover: YearMonth | null;
    readonly ratesCapturedAt: string | null;
  };
  readonly amortization: {
    readonly verdict: AmortizationVerdict;
    readonly netAnnualYield: number;
    readonly debtAnnualCost: number;
    readonly cdiAnnual: number | null;
    readonly amountToAmortize: Cents;
    readonly annualDifference: Cents;
  } | null;
}

export class GetWatchSnapshotUseCase {
  constructor(
    private readonly closeMonth: CloseMonthUseCase,
    private readonly getProjection: GetProjectionUseCase,
    private readonly clock: Clock
  ) {}

  async execute(planId: string): Promise<Result<WatchSnapshot>> {
    const today = this.clock.today();
    const month = monthOfISODate(today);

    const [closing, projected] = await Promise.all([
      this.closeMonth.execute({ planId, month }),
      this.getProjection.execute({ planId }),
    ]);
    if (!closing.ok) return closing;
    if (!projected.ok) return projected;

    const { snapshot, projection } = projected.value;
    const { allowance, rawSpending, transactions } = closing.value;
    const advice = projection.amortizationAdvice;

    const spentIn = (categoryId: string, method: PaymentMethod) =>
      addCents(
        ...transactions
          .filter(
            (t) =>
              t.kind === TransactionKind.EXPENSE &&
              t.categoryId === categoryId &&
              t.paymentMethod === method
          )
          .map((t) => t.amount)
      );

    const variableBudget = addCents(
      ...snapshot.categories.filter((c) => c.active).map((c) => c.monthlyBudget)
    );

    return ok({
      today,
      month,
      cash: allowance.cash,
      mealCard: allowance.mealCard,
      ledger: { ...rawSpending, mealCardCredit: snapshot.income.mealCardMonthly },
      nextMonth: {
        month: addMonths(month, 1),
        // Sem lançamento, o Dinheiro do mês é a soma das categorias menos o
        // reforço — a identidade que o `CloseMonthUseCase` documenta.
        cashBudget: subCents(variableBudget, projection.monthlyTopUpToFixHole),
        mealCardBudget: snapshot.income.mealCardMonthly,
      },
      categories: closing.value.categories.map(({ category, budget }) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        defaultPaymentMethod: category.defaultPaymentMethod,
        budget,
        cashSpent: spentIn(category.id, "CASH"),
        mealCardSpent: spentIn(category.id, "MEAL_CARD"),
      })),
      plan: {
        payoffMonth: projection.payoffMonth,
        minCash: projection.minCash,
        minCashMonth: projection.minCashMonth,
        monthlyTopUp: projection.monthlyTopUpToFixHole,
        pendingTurnover: pendingTurnover(today, snapshot.closings, snapshot.plan.startMonth),
        ratesCapturedAt: snapshot.rates?.capturedAt.toISOString() ?? null,
      },
      amortization: advice
        ? {
            verdict: advice.verdict,
            netAnnualYield: advice.netAnnualYield,
            debtAnnualCost: advice.debtAnnualCost,
            cdiAnnual: snapshot.rates?.cdiAnnual ?? null,
            amountToAmortize: advice.amountToAmortize,
            annualDifference: advice.annualDifference,
          }
        : null,
    });
  }
}

export interface WatchTransactionInput {
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly amount: Cents;
  readonly paymentMethod: PaymentMethod;
  readonly categoryId: string;
  /** Data civil em que o gasto foi feito no relógio. */
  readonly date: string;
}

/** Um gasto parado na fila do relógio sobe até uma semana depois. */
export const MAX_BACKDATE_DAYS = 7;

/**
 * Lança um gasto vindo do relógio. Idempotente pela chave: o relógio reenvia
 * quando reconecta, e o reenvio devolve o lançamento que já existe.
 */
export class RecordWatchTransactionUseCase {
  constructor(
    private readonly categories: BudgetCategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async execute(
    input: WatchTransactionInput
  ): Promise<Result<{ transaction: Transaction; replayed: boolean }>> {
    const existing = await this.transactions.findByClientRequestId(
      input.planId,
      input.idempotencyKey
    );
    if (existing) {
      const same =
        existing.amount === input.amount &&
        existing.paymentMethod === input.paymentMethod &&
        existing.categoryId === input.categoryId &&
        existing.date === input.date;
      return same
        ? ok({ transaction: existing, replayed: true })
        : err(new DomainError("IDEMPOTENCY_CONFLICT", "Chave já usada com outro lançamento."));
    }

    const age = daysBetweenDates(input.date, this.clock.today());
    if (age < 0 || age > MAX_BACKDATE_DAYS) {
      return err(new DomainError("DATE_OUT_OF_RANGE", "Data fora da janela de lançamento."));
    }

    // O id vem do relógio: a categoria tem que ser do próprio plano.
    const category = await this.categories.findById(input.categoryId);
    if (!category || category.planId !== input.planId || !category.active) {
      return err(new DomainError("CATEGORY_NOT_FOUND", "Categoria não encontrada."));
    }

    const transaction: Transaction = {
      id: this.ids.generate(),
      planId: input.planId,
      date: input.date,
      description: category.name,
      kind: TransactionKind.EXPENSE,
      categoryId: category.id,
      goalId: null,
      paymentMethod: input.paymentMethod,
      amount: input.amount,
      clientRequestId: input.idempotencyKey,
      createdAt: this.clock.now(),
    };
    await this.transactions.save(transaction);
    return ok({ transaction, replayed: false });
  }
}
