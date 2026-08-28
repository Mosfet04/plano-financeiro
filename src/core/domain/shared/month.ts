import { DomainError, err, ok, type Result } from "./result";

/**
 * Um mês do calendário no formato "YYYY-MM". String em vez de Date porque
 * mês não é instante: não tem fuso, não tem hora, e atravessa a fronteira
 * server/client sem serialização.
 */
export type YearMonth = string & { readonly __brand: "YearMonth" };

const PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseMonth(value: string): Result<YearMonth> {
  if (!PATTERN.test(value)) {
    return err(
      new DomainError("INVALID_MONTH", `Mês inválido: "${value}". Use o formato AAAA-MM.`)
    );
  }
  return ok(value as YearMonth);
}

/** Para dados vindos do próprio banco/seed, onde o formato já é garantido. */
export function monthOf(year: number, month: number): YearMonth {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}` as YearMonth;
}

/** Extrai o mês de uma data civil "YYYY-MM-DD". */
export function monthOfISODate(isoDate: string): YearMonth {
  return isoDate.slice(0, 7) as YearMonth;
}

export function year(value: YearMonth): number {
  return Number(value.slice(0, 4));
}

/** 1 = janeiro. */
export function monthNumber(value: YearMonth): number {
  return Number(value.slice(5, 7));
}

export function addMonths(value: YearMonth, amount: number): YearMonth {
  const total = year(value) * 12 + (monthNumber(value) - 1) + amount;
  return monthOf(Math.floor(total / 12), (total % 12) + 1);
}

/** Distância em meses de `from` até `to` (negativa se `to` for anterior). */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return year(to) * 12 + monthNumber(to) - (year(from) * 12 + monthNumber(from));
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: YearMonth, b: YearMonth): boolean {
  return a < b;
}

export function isSameOrAfter(a: YearMonth, b: YearMonth): boolean {
  return a >= b;
}

/** Verdadeiro se `value` está dentro da janela [startsOn, endsOn], ambos opcionais. */
export function isWithin(
  value: YearMonth,
  startsOn: YearMonth | null,
  endsOn: YearMonth | null
): boolean {
  if (startsOn && value < startsOn) return false;
  if (endsOn && value > endsOn) return false;
  return true;
}

const MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "ago/2026" — o formato usado na planilha e nas telas. */
export function formatMonth(value: YearMonth): string {
  return `${MONTH_NAMES[monthNumber(value) - 1]}/${year(value)}`;
}

/** Quantos dias tem o mês — usado no painel "posso gastar isso?". */
export function daysInMonth(value: YearMonth): number {
  return new Date(Date.UTC(year(value), monthNumber(value), 0)).getUTCDate();
}
