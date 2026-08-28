export const RateSource = {
  /** Buscado direto no SGS do Banco Central pelo worker semanal. */
  BCB: "BCB",
  /** Enviado pelo agente (Claude) no corpo da requisição. */
  AGENT: "AGENT",
  /** Digitado por você na tela de premissas. */
  MANUAL: "MANUAL",
} as const;
export type RateSource = (typeof RateSource)[keyof typeof RateSource];

/**
 * Foto das taxas num instante. Nunca é atualizada no lugar: cada rodada da
 * rotina de quinta grava uma linha nova, então dá para ver a projeção
 * envelhecendo junto com a Selic.
 *
 * Todas as taxas são decimais ao ano (0.14 = 14% a.a.), exceto `referenceRateMonthly`,
 * que é ao mês porque é assim que o BCB publica a TR.
 */
export interface MarketRatesSnapshot {
  readonly id: string;
  readonly capturedAt: Date;
  /** Selic meta ao ano (série SGS 432). */
  readonly selicAnnual: number;
  /** CDI anualizado base 252 (série SGS 4389). */
  readonly cdiAnnual: number;
  /** IPCA acumulado em 12 meses, calculado a partir da série SGS 433 mensal. */
  readonly ipcaAnnual: number;
  /** TR ao mês (série SGS 226). Nula quando a fonte não informou. */
  readonly referenceRateMonthly: number | null;
  readonly source: RateSource;
  readonly notes: string | null;
}
