import { cents, maxCents, minCents, ZERO, type Cents } from "../shared/money";

/**
 * Vale mais amortizar o financiamento ou deixar o dinheiro rendendo?
 *
 * A conta é uma comparação de taxas: enquanto o caixa rende, líquido de IR,
 * mais do que a dívida custa, adiantar parcela destrói valor — você troca um
 * dinheiro que rende mais por uma dívida que custa menos. Quando inverte,
 * cada mês que o dinheiro fica aplicado é dinheiro queimado.
 *
 * É a decisão que a queda da Selic vira do avesso, e por isso ela é reavaliada
 * a cada snapshot de taxas.
 */
export const AmortizationVerdict = {
  /** O caixa rende mais que a dívida custa, com folga. Não amortize. */
  INVEST: "INVEST",
  /** As taxas empataram dentro da banda morta. Nada a fazer, mas olhe. */
  BORDERLINE: "BORDERLINE",
  /** A dívida custa mais do que o caixa rende. Vale tirar do caixa e amortizar. */
  AMORTIZE: "AMORTIZE",
} as const;
export type AmortizationVerdict =
  (typeof AmortizationVerdict)[keyof typeof AmortizationVerdict];

export interface AmortizationAdviceInput {
  /** Rendimento do caixa ao ano, já líquido de IR. */
  readonly netAnnualYield: number;
  /** Juros nominais do contrato ao ano. */
  readonly financingAnnualInterest: number;
  /** TR ao mês, como o Banco Central publica. Nula quando não capturada. */
  readonly referenceRateMonthly: number | null;
  /**
   * Somar a TR ao custo da dívida.
   *
   * Deveria ser verdadeiro sempre que houver TR no snapshot: ela corrige o
   * saldo devedor todo mês, exista ou não no modelo de projeção. Ignorá-la faz
   * o aviso disparar tarde, quando a decisão já virou.
   */
  readonly includeReferenceRate: boolean;
  /** Caixa de quitação disponível. NUNCA inclua a reserva de emergência. */
  readonly availableCash: Cents;
  readonly remainingDebt: Cents;
  /**
   * Banda morta, em pontos decimais. O CDI muda toda semana; sem isto o aviso
   * ligaria e desligaria sozinho e você pararia de ler.
   */
  readonly hysteresis?: number;
}

export interface AmortizationAdvice {
  readonly verdict: AmortizationVerdict;
  readonly netAnnualYield: number;
  /** Juros do contrato mais a TR, quando ela entra na conta. */
  readonly debtAnnualCost: number;
  /** TR anualizada, ou nula quando não entra na conta. */
  readonly referenceRateAnnual: number | null;
  /** Rendimento menos custo. Negativo significa que a dívida está mais cara. */
  readonly spread: number;
  /**
   * Quanto dá para amortizar hoje: o menor entre o caixa e o saldo devedor.
   * Zero enquanto o caixa de quitação não existir — a regra continua valendo,
   * só não há dinheiro para aplicá-la ainda.
   */
  readonly amountToAmortize: Cents;
  /**
   * Diferença em reais por ano sobre esse valor. Quanto você ganha deixando
   * aplicado (INVEST) ou perde por não amortizar (AMORTIZE).
   */
  readonly annualDifference: Cents;
}

export const DEFAULT_HYSTERESIS = 0.005;

/** TR ao mês → ao ano, capitalizando. */
export function annualizeMonthly(monthly: number): number {
  return Math.pow(1 + monthly, 12) - 1;
}

/**
 * Devolve `null` só quando não há dívida — aí não existe decisão nenhuma.
 *
 * Sem caixa a regra continua valendo: ela diz para onde mandar o dinheiro que
 * entra no mês seguinte, e é isso que evita descobrir a virada tarde demais.
 * O que fica zerado é o valor a amortizar, não o veredito.
 */
export function evaluateAmortization(
  input: AmortizationAdviceInput
): AmortizationAdvice | null {
  if (input.remainingDebt <= 0) return null;

  const referenceRateAnnual =
    input.includeReferenceRate && input.referenceRateMonthly
      ? annualizeMonthly(input.referenceRateMonthly)
      : null;

  const debtAnnualCost = input.financingAnnualInterest + (referenceRateAnnual ?? 0);
  const spread = input.netAnnualYield - debtAnnualCost;
  const band = input.hysteresis ?? DEFAULT_HYSTERESIS;

  const verdict =
    spread > band
      ? AmortizationVerdict.INVEST
      : spread < -band
        ? AmortizationVerdict.AMORTIZE
        : AmortizationVerdict.BORDERLINE;

  // Caixa negativo é o buraco do plano, não dinheiro disponível.
  const amountToAmortize = maxCents(
    minCents(input.availableCash, input.remainingDebt),
    ZERO
  );

  return {
    verdict,
    netAnnualYield: input.netAnnualYield,
    debtAnnualCost,
    referenceRateAnnual,
    spread,
    amountToAmortize,
    annualDifference: cents(Math.abs(amountToAmortize * spread)) || ZERO,
  };
}
