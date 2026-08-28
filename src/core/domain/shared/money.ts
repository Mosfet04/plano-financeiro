/**
 * Dinheiro é sempre inteiro em centavos. Nunca use `number` em reais para
 * cálculo — só na borda de entrada (formulário) e de exibição.
 *
 * O tipo é uma marca (branded type) para o compilador não deixar somar
 * centavos com "um número qualquer" por acidente.
 */
export type Cents = number & { readonly __brand: "Cents" };

export function cents(value: number): Cents {
  return Math.round(value) as Cents;
}

/** Converte reais (ex.: 1233.57) para centavos (123357). */
export function reais(value: number): Cents {
  return Math.round(value * 100) as Cents;
}

export function toReais(value: Cents): number {
  return value / 100;
}

export function addCents(...values: Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0) as Cents;
}

export function subCents(a: Cents, b: Cents): Cents {
  return (a - b) as Cents;
}

/** Multiplica por um fator decimal (taxa de juros, percentual) e arredonda ao centavo. */
export function mulRate(value: Cents, rate: number): Cents {
  return Math.round(value * rate) as Cents;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return (a > b ? a : b) as Cents;
}

export function minCents(a: Cents, b: Cents): Cents {
  return (a < b ? a : b) as Cents;
}

export const ZERO = 0 as Cents;

/** Arredonda para a centena de reais mais próxima — usado nos alvos de reserva. */
export function roundToHundredReais(value: Cents): Cents {
  return (Math.round(value / 10_000) * 10_000) as Cents;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(value: Cents): string {
  return BRL.format(toReais(value));
}

/** Sem símbolo — para tabelas densas onde o "R$" só polui. */
const PLAIN = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value: Cents): string {
  return PLAIN.format(toReais(value));
}
