import type { Indexer } from "../investment/investment.entity";
import type { Cents } from "../shared/money";

/**
 * Onde o dinheiro líquido está hoje: conta corrente, caixinha do Nubank,
 * cofrinho do PicPay, Tesouro Selic de liquidez diária.
 *
 * É o oposto de uma `Investment`: não tem vencimento, então não "cai no caixa"
 * num mês — já está no caixa desde o primeiro mês da projeção, e rende ali
 * mesmo. Antes disto existia um único escalar (`cashOnHand`) que não rendia e
 * não distinguia a conta corrente parada da caixinha a 100% do CDI.
 *
 * Não tem campo de destino ("isto é a reserva, aquilo é a quitação") pela mesma
 * razão que `Investment` não tem: a regra de alocação já decide — enche a
 * reserva até o alvo, o excedente vira caixa de quitação.
 */
export interface CashAccount {
  readonly id: string;
  readonly planId: string;
  /** "Caixinha Nubank", "Cofrinho PicPay", "Conta corrente". */
  readonly name: string;
  readonly balance: Cents;
  /** Nulo quando o dinheiro não rende — conta corrente, dinheiro na carteira. */
  readonly indexer: Indexer | null;
  readonly indexerValue: number;
  /** Isento de IR (LCI/LCA de liquidez diária, poupança). */
  readonly taxExempt: boolean;
  /** Data civil "YYYY-MM-DD" em que o saldo foi conferido pela última vez. */
  readonly checkedOn: string;
}
