import type { Cents } from "../shared/money";
import type { YearMonth } from "../shared/month";

export const AmortizationSystem = {
  /** Amortização constante, parcela decrescente. É o do contrato da CAIXA. */
  SAC: "SAC",
  /** Parcela constante. */
  PRICE: "PRICE",
} as const;
export type AmortizationSystem = (typeof AmortizationSystem)[keyof typeof AmortizationSystem];

export interface Financing {
  readonly id: string;
  readonly planId: string;
  readonly name: string;
  readonly principal: Cents;
  readonly termMonths: number;
  /** Juros nominais ao ano, decimal: 0.0766 = 7,66%. */
  readonly annualInterest: number;
  readonly system: AmortizationSystem;
  /** Seguros + taxa de administração, valor fixo mensal. */
  readonly insuranceMonthly: Cents;
  readonly firstInstallmentMonth: YearMonth;
  /**
   * Corrigir o saldo devedor pela TR do último snapshot.
   *
   * A planilha assume TR = 0. Em ago/2026 a TR está em ~0,17% ao mês, o que
   * NÃO é desprezível em 420 meses — mas ligar isso muda todos os números do
   * plano, então a escolha é explícita e sua.
   */
  readonly applyReferenceRate: boolean;
}

/** Amortização extra num mês específico — sai do caixa e abate o saldo devedor. */
export interface ExtraAmortization {
  readonly id: string;
  readonly financingId: string;
  readonly month: YearMonth;
  readonly amount: Cents;
}
