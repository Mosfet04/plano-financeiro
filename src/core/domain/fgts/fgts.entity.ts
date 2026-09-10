import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";

/**
 * O FGTS como fonte de amortização periódica.
 *
 * Não é caixa: você não pode gastar, só usar nas hipóteses da lei — e a que
 * interessa aqui é abater o financiamento. Por isso ele não entra em
 * `cash_accounts` nem conta para a reserva: fica numa conta à parte que só
 * conversa com a dívida.
 *
 * O valor de cada amortização não é digitado, é **projetado**: o saldo cresce
 * com o depósito mensal do empregador e com o rendimento, e no mês em que a lei
 * libera, o que tiver acumulado vira abatimento. Digitar um valor para 2028
 * seria chutar o que só a conta sabe.
 */
export interface FgtsSettings {
  readonly planId: string;
  /** Desligado, o FGTS não aparece na projeção. */
  readonly enabled: boolean;
  /** Saldo de hoje. Atualize junto com os saldos das caixinhas, no fechamento. */
  readonly balance: Cents;
  /**
   * Fração do salário bruto depositada por mês. A lei manda 8% para contrato
   * CLT por prazo indeterminado.
   */
  readonly depositRate: number;
  /**
   * Rendimento ao ano, decimal. A lei manda 3% + TR; o padrão aqui é 0.03, e
   * quem quiser embutir a TR soma na mão — não há acoplamento escondido com o
   * interruptor de TR do financiamento, que é sobre outra coisa.
   */
  readonly annualYield: number;
  /** A cada quantos meses dá para usar. No SFH são 24. */
  readonly withdrawalEveryMonths: number;
  /** Primeiro mês em que você pode sacar para amortizar. */
  readonly firstWithdrawalMonth: YearMonth;
}

/** O mês é um dos saques periódicos? */
export function isWithdrawalMonth(fgts: FgtsSettings, monthsFromFirst: number): boolean {
  if (!fgts.enabled || monthsFromFirst < 0) return false;
  if (fgts.withdrawalEveryMonths <= 0) return monthsFromFirst === 0;
  return monthsFromFirst % fgts.withdrawalEveryMonths === 0;
}
