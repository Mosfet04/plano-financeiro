import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";

export const ItemDirection = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const;
export type ItemDirection = (typeof ItemDirection)[keyof typeof ItemDirection];

/**
 * Onde o item aparece na projeção. HOUSING soma junto com a parcela do
 * financiamento na coluna "Moradia"; FIXED vai para "Outras fixas".
 */
export const ItemGroup = {
  HOUSING: "HOUSING",
  FIXED: "FIXED",
} as const;
export type ItemGroup = (typeof ItemGroup)[keyof typeof ItemGroup];

/**
 * Conta recorrente com vigência. É isto que substitui as regras hardcoded da
 * planilha: o aluguel é um item que TERMINA no mês da mudança, o condomínio é
 * um que COMEÇA nele, e o auxílio home office é um item de entrada no grupo
 * moradia (abate o custo do apê exatamente como na planilha).
 *
 * Nenhum caso especial no motor — só datas.
 */
export interface RecurringItem {
  readonly id: string;
  readonly planId: string;
  readonly name: string;
  readonly direction: ItemDirection;
  readonly group: ItemGroup;
  readonly amount: Cents;
  /** Dia do vencimento (1–31), só para exibição no checklist do mês. */
  readonly dueDay: number | null;
  /** Nulo = vale desde sempre. */
  readonly startsOn: YearMonth | null;
  /** Nulo = não acaba. */
  readonly endsOn: YearMonth | null;
  readonly active: boolean;
  readonly sortOrder: number;
}
