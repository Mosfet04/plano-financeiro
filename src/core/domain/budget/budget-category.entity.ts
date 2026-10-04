import type { Cents } from "../shared/money";

export const PaymentMethod = {
  /** Vale-refeição/alimentação (Swile). Não consome o salário. */
  MEAL_CARD: "MEAL_CARD",
  CASH: "CASH",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Ícones que uma categoria pode ter — nomes do Lucide. Lista fechada porque o
 * relógio precisa ter cada um desenhado: um nome livre viraria ícone quebrado.
 */
export const CATEGORY_ICONS = [
  "tag",
  "shopping-cart",
  "utensils",
  "car",
  "bus",
  "pill",
  "house",
  "wrench",
  "paw-print",
  "heart",
  "star",
  "shopping-bag",
  "repeat",
  "gift",
  "shirt",
  "graduation-cap",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/**
 * Categoria do orçamento variável. O total das categorias ativas é o que a
 * projeção usa como gasto variável de cada mês.
 */
export interface BudgetCategory {
  readonly id: string;
  readonly planId: string;
  readonly name: string;
  readonly monthlyBudget: Cents;
  readonly defaultPaymentMethod: PaymentMethod;
  /** Token de cor da paleta (ex.: "chart-1"), não um hex solto. */
  readonly color: string;
  readonly icon: CategoryIcon;
  readonly active: boolean;
  readonly sortOrder: number;
}
