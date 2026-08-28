import type { Investment } from "../investment/investment.entity";
import { Indexer } from "../investment/investment.entity";
import type { MarketRatesSnapshot } from "../market/market-rates.entity";
import { YieldMode, type YieldPolicy } from "../plan/plan.entity";

/** Converte taxa ao ano em taxa ao mês, capitalizando. */
export function monthlyFromAnnual(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/**
 * Rendimento líquido anual esperado do caixa.
 *
 * No modo CDI_LINKED é isto que a rotina de quinta-feira move: chegou um
 * snapshot com CDI menor, o caixa rende menos e a quitação atrasa.
 */
export function netAnnualYield(policy: YieldPolicy, rates: MarketRatesSnapshot | null): number {
  if (policy.mode === YieldMode.MANUAL || !rates) return policy.manualAnnualNet;
  return rates.cdiAnnual * policy.cdiPercent * (1 - policy.incomeTaxRate);
}

/** Taxa anual bruta de uma aplicação, dado o snapshot de mercado vigente. */
export function investmentAnnualGross(
  investment: Investment,
  rates: MarketRatesSnapshot | null
): number {
  if (investment.indexer === Indexer.PREFIXED) return investment.indexerValue;
  if (!rates) return 0;

  switch (investment.indexer) {
    case Indexer.CDI_PCT:
      return rates.cdiAnnual * investment.indexerValue;
    case Indexer.SELIC_PCT:
      return rates.selicAnnual * investment.indexerValue;
    case Indexer.IPCA_PLUS:
      return (1 + rates.ipcaAnnual) * (1 + investment.indexerValue) - 1;
  }
}

/**
 * Taxa anual líquida da aplicação. LCI/LCA são isentas; o resto leva IR.
 *
 * Usa uma alíquota única em vez da tabela regressiva de verdade (22,5% até 180
 * dias, caindo até 15% depois de 720). Para papéis que já estão perto do
 * vencimento a diferença é pequena, e a alternativa exigiria a data de
 * aplicação de cada um.
 */
export function investmentAnnualNet(
  investment: Investment,
  rates: MarketRatesSnapshot | null,
  incomeTaxRate: number
): number {
  const gross = investmentAnnualGross(investment, rates);
  return investment.taxExempt ? gross : gross * (1 - incomeTaxRate);
}
