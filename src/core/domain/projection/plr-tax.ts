import { cents, mulRate, reais, subCents, ZERO, type Cents } from "../shared/money";

/**
 * Tabela exclusiva de tributação da PLR (Lei 10.101/2000). É separada da tabela
 * do salário e bem mais favorável — por isso a PLR não pode ser tratada como
 * bônus comum.
 *
 * Valores da tabela vigente em 2026. Se a Receita atualizar, é aqui que muda.
 */
interface Bracket {
  /** Teto da faixa, em centavos. `null` = última faixa. */
  readonly upTo: Cents | null;
  readonly rate: number;
  readonly deduction: Cents;
}

export const PLR_BRACKETS: readonly Bracket[] = [
  { upTo: reais(7640.8), rate: 0, deduction: ZERO },
  { upTo: reais(9922.28), rate: 0.075, deduction: reais(573.06) },
  { upTo: reais(13167), rate: 0.15, deduction: reais(1317.23) },
  { upTo: reais(16380.38), rate: 0.225, deduction: reais(2304.76) },
  { upTo: null, rate: 0.275, deduction: reais(3123.78) },
];

export function plrIncomeTax(gross: Cents): Cents {
  const bracket = PLR_BRACKETS.find((b) => b.upTo === null || gross <= b.upTo);
  // A última faixa tem upTo nulo, então o find sempre acha alguma.
  if (!bracket) return ZERO;

  const tax = subCents(mulRate(gross, bracket.rate), bracket.deduction);
  return tax > 0 ? tax : ZERO;
}

export function plrNet(gross: Cents): Cents {
  return subCents(gross, plrIncomeTax(gross));
}

/** PLR bruta = múltiplo de salários brutos. */
export function plrGross(grossSalary: Cents, salariesMultiple: number): Cents {
  return cents(grossSalary * salariesMultiple);
}
