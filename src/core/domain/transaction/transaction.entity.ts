import type { PaymentMethod } from "../budget/budget-category.entity";
import type { Cents } from "../shared/money";

export const TransactionKind = {
  EXPENSE: "EXPENSE",
  /** Entrada fora do salário: freela, reembolso, venda. */
  EXTRA_INCOME: "EXTRA_INCOME",
  /** Gasto que pertence a uma meta (anel, mudança), não ao orçamento do mês. */
  GOAL: "GOAL",
} as const;
export type TransactionKind = (typeof TransactionKind)[keyof typeof TransactionKind];

/**
 * Um lançamento do dia a dia. `amount` é sempre positivo — o que dá o sinal
 * é o `kind`.
 */
export interface Transaction {
  readonly id: string;
  readonly planId: string;
  /** Data civil "YYYY-MM-DD". */
  readonly date: string;
  readonly description: string;
  readonly kind: TransactionKind;
  /** Nulo para EXTRA_INCOME e para gastos de meta. */
  readonly categoryId: string | null;
  readonly goalId: string | null;
  readonly paymentMethod: PaymentMethod;
  readonly amount: Cents;
  readonly createdAt: Date;
}
