import { cents, maxCents, minCents, mulRate, ZERO, type Cents } from "../shared/money";

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
  if (monthlyRate <= 0) return cents(principal / termMonths);
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return cents((principal * monthlyRate * factor) / (factor - 1));
}

/**
 * Amortização do mês, derivada do saldo devedor e do prazo que resta.
 *
 * Derivar em vez de guardar a parcela do contrato é o que faz os dois sistemas
 * funcionarem sob correção monetária: recalcular sobre (saldo, prazo restante)
 * devolve exatamente a mesma parcela num mês normal — é propriedade da PRICE e
 * da SAC —, e é o que a CAIXA faz de fato quando a TR corrige o saldo. Guardar
 * a parcela original faria a amortização encolher mês a mês com a TR ligada, e
 * virar negativa quando os juros passassem a parcela.
 */
export function amortizationFor(
  system: "SAC" | "PRICE",
  balance: Cents,
  monthlyRate: number,
  remainingMonths: number
): Cents {
  if (balance <= 0 || remainingMonths <= 0) return ZERO;

  if (system === "SAC") {
    return minCents(cents(balance / remainingMonths), balance);
  }

  const installment = priceInstallment(balance, monthlyRate, remainingMonths);
  const interest = interestOn(balance, monthlyRate);
  // Piso em zero: parcela abaixo dos juros amortizaria negativo, e saldo que
  // cresce sozinho é bug, não cenário.
  return minCents(maxCents(cents(installment - interest), ZERO), balance);
}

/**
 * O que fazer com a folga quando entra uma amortização extra.
 *
 * Reduzir o prazo economiza mais juros e é o que serve a um plano cujo objetivo
 * é quitar. Reduzir a parcela alivia o caixa do mês — vale quando o aperto é
 * agora, não em 2030.
 */
export const ExtraAmortizationEffect = {
  SHORTEN_TERM: "SHORTEN_TERM",
  REDUCE_INSTALLMENT: "REDUCE_INSTALLMENT",
} as const;
export type ExtraAmortizationEffect =
  (typeof ExtraAmortizationEffect)[keyof typeof ExtraAmortizationEffect];

/**
 * Prazo que resta depois de uma amortização extra, quando a escolha é **reduzir
 * o prazo**: o menor número de meses que mantém o pagamento onde estava.
 *
 * `paymentToKeep` é o que cada sistema mantém constante: na SAC a amortização,
 * na PRICE a parcela inteira.
 *
 * Reduzir a parcela não precisa de conta nenhuma — basta manter o prazo, e a
 * derivação do mês seguinte já devolve uma parcela menor.
 */
export function termAfterExtraAmortization(
  system: "SAC" | "PRICE",
  balanceAfter: Cents,
  monthlyRate: number,
  remainingMonths: number,
  paymentToKeep: Cents
): number {
  if (balanceAfter <= 0) return 0;
  if (paymentToKeep <= 0) return remainingMonths;

  if (system === "SAC") {
    // A parcela SAC cai todo mês; o que se mantém constante é a amortização.
    return Math.max(1, Math.min(remainingMonths, Math.ceil(balanceAfter / paymentToKeep)));
  }

  const interest = balanceAfter * monthlyRate;
  // Parcela que não cobre nem os juros nunca quita: mantém o prazo e deixa a
  // parcela cair, que é o único desfecho possível.
  if (paymentToKeep <= interest) return remainingMonths;

  const months = -Math.log(1 - interest / paymentToKeep) / Math.log(1 + monthlyRate);
  return Math.max(1, Math.min(remainingMonths, Math.ceil(months)));
}
