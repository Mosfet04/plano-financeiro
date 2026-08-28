import type { Cents } from "../shared/money";

export const Indexer = {
  /** Percentual do CDI: 103% CDI → CDI_PCT com indexerValue 1.03. */
  CDI_PCT: "CDI_PCT",
  /** Prefixado: indexerValue é a taxa ao ano (0.13 = 13% a.a.). */
  PREFIXED: "PREFIXED",
  /** IPCA + spread: indexerValue é o spread ao ano. */
  IPCA_PLUS: "IPCA_PLUS",
  /** Percentual da Selic. */
  SELIC_PCT: "SELIC_PCT",
} as const;
export type Indexer = (typeof Indexer)[keyof typeof Indexer];

/**
 * Uma aplicação da carteira. No vencimento o dinheiro cai no caixa do mês e a
 * regra de alocação decide o destino (enche a reserva primeiro, o resto vai
 * para o caixa de quitação) — por isso não existe campo "destino" aqui: seria
 * um dado que não muda conta nenhuma.
 */
export interface Investment {
  readonly id: string;
  readonly planId: string;
  readonly name: string;
  /** Valor atual da posição. */
  readonly amount: Cents;
  /** Data civil "YYYY-MM-DD" do vencimento. */
  readonly maturityDate: string;
  readonly indexer: Indexer;
  readonly indexerValue: number;
  /** Isento de IR (LCI/LCA) — muda o rendimento líquido até o vencimento. */
  readonly taxExempt: boolean;
  /** O que fazer no vencimento, em texto livre. Aparece no card "o que fazer agora". */
  readonly instruction: string | null;
}
