import { describe, expect, it } from "vitest";

import {
  AmortizationVerdict,
  annualizeMonthly,
  evaluateAmortization,
} from "@/core/domain/projection/amortization-advice";
import { reais } from "@/core/domain/shared/money";

const base = {
  netAnnualYield: 0.1182,
  financingAnnualInterest: 0.0766,
  referenceRateMonthly: 0.001709,
  includeReferenceRate: true,
  availableCash: reais(50000),
  remainingDebt: reais(250000),
};

describe("evaluateAmortization", () => {
  it("com o CDI de hoje, ainda vale investir", () => {
    const advice = evaluateAmortization(base)!;

    expect(advice.verdict).toBe(AmortizationVerdict.INVEST);
    expect(advice.spread).toBeGreaterThan(0);
  });

  it("a TR entra no custo da dívida e encurta a folga", () => {
    const comTr = evaluateAmortization(base)!;
    const semTr = evaluateAmortization({ ...base, includeReferenceRate: false })!;

    // 7,66% + TR anualizada ≈ 9,75%, contra os 7,66% nominais.
    expect(comTr.debtAnnualCost).toBeGreaterThan(semTr.debtAnnualCost);
    expect(comTr.referenceRateAnnual).toBeCloseTo(annualizeMonthly(0.001709), 10);
    expect(semTr.referenceRateAnnual).toBeNull();
    // Ignorar a TR faz a decisão parecer mais confortável do que é.
    expect(comTr.spread).toBeLessThan(semTr.spread);
  });

  it("manda amortizar quando o CDI cai abaixo do custo da dívida", () => {
    const advice = evaluateAmortization({ ...base, netAnnualYield: 0.07 })!;

    expect(advice.verdict).toBe(AmortizationVerdict.AMORTIZE);
    expect(advice.spread).toBeLessThan(0);
    // R$ 50.000 parados a 2,75 p.p. abaixo do custo custam ~R$ 1.375 por ano.
    expect(advice.annualDifference).toBeGreaterThan(reais(1000));
  });

  it("não oscila dentro da banda morta", () => {
    // Empate técnico: 0,2 p.p. acima e abaixo do custo.
    const custo = 0.0766 + annualizeMonthly(0.001709);

    for (const yield_ of [custo + 0.002, custo - 0.002, custo]) {
      expect(evaluateAmortization({ ...base, netAnnualYield: yield_ })!.verdict).toBe(
        AmortizationVerdict.BORDERLINE
      );
    }
  });

  it("respeita uma banda morta customizada", () => {
    const custo = 0.0766 + annualizeMonthly(0.001709);
    const advice = evaluateAmortization({
      ...base,
      netAnnualYield: custo - 0.002,
      hysteresis: 0.001,
    })!;

    expect(advice.verdict).toBe(AmortizationVerdict.AMORTIZE);
  });

  it("nunca sugere amortizar mais do que o saldo devedor", () => {
    const advice = evaluateAmortization({
      ...base,
      netAnnualYield: 0.05,
      availableCash: reais(400000),
      remainingDebt: reais(250000),
    })!;

    expect(advice.amountToAmortize).toBe(reais(250000));
  });

  it("sem dívida não há decisão nenhuma", () => {
    expect(evaluateAmortization({ ...base, remainingDebt: reais(0) })).toBeNull();
  });

  it("sem caixa o veredito continua valendo, só o valor zera", () => {
    // A regra diz para onde mandar o dinheiro do mês que vem, mesmo sem caixa hoje.
    const semCaixa = evaluateAmortization({ ...base, availableCash: reais(0) })!;
    expect(semCaixa.verdict).toBe(AmortizationVerdict.INVEST);
    expect(semCaixa.amountToAmortize).toBe(reais(0));
    expect(semCaixa.annualDifference).toBe(reais(0));

    // Caixa negativo é o buraco de dez/2026, não dinheiro disponível.
    const caixaNegativo = evaluateAmortization({ ...base, availableCash: reais(-2435) })!;
    expect(caixaNegativo.amountToAmortize).toBe(reais(0));
  });
});
