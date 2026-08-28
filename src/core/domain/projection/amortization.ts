import { cents, mulRate, ZERO, type Cents } from "../shared/money";

/**
 * Juros ao mês a partir da taxa nominal ao ano.
 *
 * Divisão simples, não capitalizada — é a convenção do contrato da CAIXA:
 * 7,66% a.a. → 0,63833% a.m., que reproduz exatamente os R$ 1.659,67 de juros
 * da primeira parcela sobre R$ 260.000.
 */
export function monthlyInterestRate(annualInterest: number): number {
  return annualInterest / 12;
}

export function interestOn(balance: Cents, monthlyRate: number): Cents {
  return mulRate(balance, monthlyRate);
}

/** SAC: amortização constante ao longo de todo o prazo. */
export function sacAmortization(principal: Cents, termMonths: number): Cents {
  if (termMonths <= 0) return ZERO;
  return cents(principal / termMonths);
}

/** PRICE: parcela constante (juros + amortização). */
export function priceInstallment(principal: Cents, monthlyRate: number, termMonths: number): Cents {
  if (termMonths <= 0) return ZERO;
  if (monthlyRate === 0) return cents(principal / termMonths);
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return cents((principal * monthlyRate * factor) / (factor - 1));
}
