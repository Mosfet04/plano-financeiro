import { describe, expect, it } from "vitest";

import { plrGross, plrIncomeTax, plrNet } from "@/core/domain/projection/plr-tax";
import {
  interestOn,
  monthlyInterestRate,
  priceInstallment,
  sacAmortization,
} from "@/core/domain/projection/amortization";
import { reais } from "@/core/domain/shared/money";

describe("plrIncomeTax", () => {
  it("é isenta até o teto da primeira faixa", () => {
    expect(plrIncomeTax(reais(7640.8))).toBe(reais(0));
    expect(plrIncomeTax(reais(5000))).toBe(reais(0));
  });

  it.each([
    [9000, 0.075, 573.06],
    [12000, 0.15, 1317.23],
    [15000, 0.225, 2304.76],
    [25500, 0.275, 3123.78],
  ])("aplica a faixa correta para PLR bruta de R$ %i", (gross, rate, deduction) => {
    expect(plrIncomeTax(reais(gross))).toBe(reais(gross * rate - deduction));
  });

  it("reproduz a PLR do plano: 3 salários de R$ 8.500", () => {
    const gross = plrGross(reais(8500), 3);
    expect(gross).toBe(reais(25500));
    expect(plrIncomeTax(gross)).toBe(reais(3888.72));
    expect(plrNet(gross)).toBe(reais(21611.28));
  });

  it("nunca devolve imposto negativo", () => {
    expect(plrIncomeTax(reais(7700))).toBeGreaterThanOrEqual(0);
  });
});

describe("amortização", () => {
  const monthlyRate = monthlyInterestRate(0.0766);

  it("reproduz a primeira parcela do contrato da CAIXA", () => {
    // Conferido contra o PDF da simulação: R$ 260.000 × 0,63833% = R$ 1.659,67.
    expect(interestOn(reais(260000), monthlyRate)).toBe(reais(1659.67));
    expect(sacAmortization(reais(260000), 420)).toBe(reais(619.05));
  });

  it("PRICE devolve parcela constante maior que a amortização SAC inicial", () => {
    const price = priceInstallment(reais(260000), monthlyRate, 420);
    expect(price).toBeGreaterThan(reais(1659.67));
    expect(price).toBeLessThan(reais(2500));
  });

  it("prazo zero não divide por zero", () => {
    expect(sacAmortization(reais(260000), 0)).toBe(0);
    expect(priceInstallment(reais(260000), monthlyRate, 0)).toBe(0);
  });
});
