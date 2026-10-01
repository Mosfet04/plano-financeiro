import type { CashAccount } from "../cash/cash-account.entity";
import type { Investment } from "../investment/investment.entity";
import { Indexer } from "../investment/investment.entity";
import type { MarketRatesSnapshot } from "../market/market-rates.entity";
import { YieldMode, type YieldPolicy } from "../plan/plan.entity";
import { addCents, cents, ZERO, type Cents } from "../shared/money";
import { daysBetweenDates } from "../shared/month";

/** Converte taxa ao ano em taxa ao mês, capitalizando. */
export function monthlyFromAnnual(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/**
 * Rendimento líquido anual esperado do caixa de quitação.
 *
 * No modo CDI_LINKED é isto que a rotina de quinta-feira move: chegou um
 * snapshot com CDI menor, o caixa rende menos e a quitação atrasa.
 */
export function netAnnualYield(policy: YieldPolicy, rates: MarketRatesSnapshot | null): number {
  if (policy.mode === YieldMode.MANUAL || !rates) return policy.manualAnnualNet;
  return rates.cdiAnnual * policy.cdiPercent * (1 - policy.incomeTaxRate);
}

/**
 * Taxa anual bruta de um par indexador/valor contra o snapshot vigente.
 * Indexador nulo é dinheiro que não rende — conta corrente.
 */
export function indexedAnnualGross(
  indexer: Indexer | null,
  indexerValue: number,
  rates: MarketRatesSnapshot | null
): number {
  if (indexer === null) return 0;
  if (indexer === Indexer.PREFIXED) return indexerValue;
  if (!rates) return 0;

  switch (indexer) {
    case Indexer.CDI_PCT:
      return rates.cdiAnnual * indexerValue;
    case Indexer.SELIC_PCT:
      return rates.selicAnnual * indexerValue;
    case Indexer.IPCA_PLUS:
      return (1 + rates.ipcaAnnual) * (1 + indexerValue) - 1;
  }
}

/** Taxa anual bruta de uma aplicação, dado o snapshot de mercado vigente. */
export function investmentAnnualGross(
  investment: Investment,
  rates: MarketRatesSnapshot | null
): number {
  return indexedAnnualGross(investment.indexer, investment.indexerValue, rates);
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

/** Taxa anual líquida de uma conta de caixa. Mesma aproximação de IR das aplicações. */
export function cashAccountAnnualNet(
  account: CashAccount,
  rates: MarketRatesSnapshot | null,
  incomeTaxRate: number
): number {
  const gross = indexedAnnualGross(account.indexer, account.indexerValue, rates);
  return account.taxExempt ? gross : gross * (1 - incomeTaxRate);
}

/**
 * Quanto a conta deve ter rendido entre duas datas civis, à taxa líquida de
 * hoje. É o "esperado" da virada do mês: saldo anterior + isto.
 *
 * Dias corridos sobre 365 em vez de dias úteis sobre 252. Erra uns centavos
 * para cima ou para baixo, e é uma estimativa para comparar com o app do banco.
 */
export function estimatedYieldBetween(
  account: CashAccount,
  rates: MarketRatesSnapshot | null,
  incomeTaxRate: number,
  fromDate: string,
  toDate: string
): Cents {
  const days = daysBetweenDates(fromDate, toDate);
  if (days <= 0) return ZERO;

  const annual = cashAccountAnnualNet(account, rates, incomeTaxRate);
  return cents(account.balance * (Math.pow(1 + annual, days / 365) - 1));
}

/**
 * Taxa média das contas de caixa, ponderada pelo saldo — é a taxa a que a
 * reserva capitaliza, porque a reserva mora nestas contas.
 *
 * **Sem contas cadastradas devolve zero**, e é de propósito: o motor só afirma
 * rendimento onde você disse que o dinheiro está. É também o que reproduz a
 * planilha, que nunca rendeu a reserva.
 */
export function blendedCashAnnualNet(
  accounts: readonly CashAccount[],
  rates: MarketRatesSnapshot | null,
  incomeTaxRate: number
): number {
  const total = addCents(...accounts.map((account) => account.balance));
  if (total <= 0) return 0;

  const weighted = accounts.reduce(
    (sum, account) => sum + account.balance * cashAccountAnnualNet(account, rates, incomeTaxRate),
    0
  );
  return weighted / total;
}

/** Saldo somado das contas de caixa — o caixa de abertura da projeção. */
export function totalCashBalance(accounts: readonly CashAccount[]): Cents {
  return addCents(...accounts.map((account) => account.balance));
}
