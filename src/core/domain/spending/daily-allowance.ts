import { cents, subCents, type Cents } from "../shared/money";
import { dayOfISODate, daysInMonth, monthOfISODate } from "../shared/month";

export interface DailyAllowanceInput {
  readonly monthBudget: Cents;
  readonly spentBeforeToday: Cents;
  readonly spentToday: Cents;
  /** Data civil de hoje, "YYYY-MM-DD", no fuso do app. */
  readonly today: string;
}

export interface DailyAllowance {
  readonly monthBudget: Cents;
  /** Dias que faltam no mês, contando hoje. */
  readonly daysLeft: number;
  /** O que cabe hoje: o que restava até ontem dividido pelos dias que faltam. */
  readonly dayBudget: Cents;
  /** O que ainda dá para gastar hoje. Negativo = passou do limite do dia. */
  readonly remainingToday: Cents;
  readonly monthRemaining: Cents;
}

/**
 * Quanto dá para gastar hoje, por fonte:
 * `(orçamento do mês − gasto até ontem) ÷ dias que faltam − gasto de hoje`.
 *
 * O gasto de hoje sai inteiro do dia, não é rateado: gastar mais hoje não pode
 * parecer de graça até amanhã. Mês estourado divide o buraco pelos dias que
 * faltam — o valor do dia fica negativo de propósito. Arredonda para baixo:
 * o app nunca promete um centavo que não existe.
 */
export function dailyAllowance(input: DailyAllowanceInput): DailyAllowance {
  const month = monthOfISODate(input.today);
  const daysLeft = daysInMonth(month) - dayOfISODate(input.today) + 1;
  const leftBeforeToday = subCents(input.monthBudget, input.spentBeforeToday);
  const dayBudget = cents(Math.floor(leftBeforeToday / daysLeft));

  return {
    monthBudget: input.monthBudget,
    daysLeft,
    dayBudget,
    remainingToday: subCents(dayBudget, input.spentToday),
    monthRemaining: subCents(leftBeforeToday, input.spentToday),
  };
}
