import { describe, expect, it } from "vitest";

import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import type { ExtraAmortization } from "@/core/domain/financing/financing.entity";
import { AmortizationSystem } from "@/core/domain/financing/financing.entity";
import type { FgtsSettings } from "@/core/domain/fgts/fgts.entity";
import { Indexer } from "@/core/domain/investment/investment.entity";
import { ExtraAmortizationEffect } from "@/core/domain/projection/amortization";
import { projectPlan, type ProjectionInput } from "@/core/domain/projection/project-plan";
import { reais, type Cents } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";
import { spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

const base = spreadsheetProjectionInput();
const contract = base.financing!;

/** Caixa gordo o bastante para a amortização não deixar o plano no vermelho. */
const caixa: CashAccount = {
  id: "c",
  planId: "plan-planilha",
  name: "Caixa",
  balance: reais(80_000),
  indexer: Indexer.CDI_PCT,
  indexerValue: 1,
  taxExempt: false,
  checkedOn: "2026-07-31",
};

const extra = (month: string, amount: number): ExtraAmortization => ({
  id: `e-${month}`,
  financingId: contract.id,
  month: month as YearMonth,
  amount: reais(amount),
});

const project = (over: Partial<ProjectionInput> = {}) =>
  projectPlan({ ...base, cashAccounts: [caixa], ...over });

const monthOf = (r: ReturnType<typeof project>, month: string) =>
  r.months.find((m) => m.month === month)!;

describe("amortização do bolso", () => {
  it("abate a dívida no mês marcado", () => {
    const sem = project();
    const com = project({ extraAmortizations: [extra("2027-06", 20_000)] });

    expect(monthOf(com, "2027-06").extraAmortization).toBe(reais(20_000));
    expect(monthOf(com, "2027-06").debt).toBeLessThan(monthOf(sem, "2027-06").debt);
  });

  /**
   * A diferença que separa esta seção da do FGTS: dinheiro do bolso SAI do caixa
   * de quitação. O FGTS não — ele abate a dívida sem passar pelo caixa.
   */
  it("sai do caixa de quitação, ao contrário do FGTS", () => {
    const sem = project();
    const doBolso = project({ extraAmortizations: [extra("2027-06", 20_000)] });

    const fgts: FgtsSettings = {
      planId: "plan-planilha",
      enabled: true,
      balance: reais(20_000),
      depositRate: 0,
      annualYield: 0,
      withdrawalEveryMonths: 0,
      firstWithdrawalMonth: "2027-06" as YearMonth,
    };
    const doFgts = project({ fgts });

    expect(monthOf(doBolso, "2027-06").payoffCash).toBeLessThan(monthOf(sem, "2027-06").payoffCash);
    expect(monthOf(doFgts, "2027-06").payoffCash).toBe(monthOf(sem, "2027-06").payoffCash);
  });

  it("não amortiza mais do que a dívida", () => {
    const com = project({ extraAmortizations: [extra("2027-06", 5_000_000)] });
    const junho = monthOf(com, "2027-06");

    expect(junho.debt).toBe(0);
    expect(junho.extraAmortization).toBeLessThan(reais(300_000));
  });

  it("vários meses acumulam", () => {
    const com = project({
      extraAmortizations: [extra("2027-03", 10_000), extra("2027-09", 10_000)],
    });

    expect(monthOf(com, "2027-03").extraAmortization).toBe(reais(10_000));
    expect(monthOf(com, "2027-09").extraAmortization).toBe(reais(10_000));
    expect(monthOf(com, "2027-06").extraAmortization).toBe(0);
  });

  it("antes da primeira parcela não faz nada", () => {
    // A primeira parcela é dez/2026.
    const com = project({ extraAmortizations: [extra("2026-09", 20_000)] });
    expect(monthOf(com, "2026-09").extraAmortization).toBe(0);
  });

  /**
   * Amortizar não é grátis, e o motor sabe disso.
   *
   * O abatimento sai do caixa e entra na dívida: no instante da amortização a
   * distância entre os dois não muda. O que muda é o futuro — a dívida passa a
   * render menos juros contra você, e o caixa passa a render menos a seu favor.
   * Com CDI a 13,9% (uns 11,8% líquidos) contra 7,66% do contrato, o caixa rende
   * MAIS do que a dívida custa, e amortizar ATRASA a quitação.
   *
   * É a mesma conta de `amortization-advice`, que é quem avisa no resumo. Estes
   * dois testes são o que garante que a projeção e o aviso não se contradigam.
   */
  it("com caixa rendendo mais que a dívida custa, amortizar atrasa a quitação", () => {
    const sem = project();
    const com = project({ extraAmortizations: [extra("2027-06", 30_000)] });

    expect(com.payoffMonth!.localeCompare(sem.payoffMonth!)).toBeGreaterThan(0);
  });

  it("com dívida cara, amortizar antecipa a quitação", () => {
    const caro = { ...contract, annualInterest: 0.24 };
    const sem = project({ financing: caro });
    const com = project({ financing: caro, extraAmortizations: [extra("2027-06", 30_000)] });

    expect(com.payoffMonth!.localeCompare(sem.payoffMonth!)).toBeLessThan(0);
  });

  it("soma com o FGTS no mesmo mês", () => {
    const fgts: FgtsSettings = {
      planId: "plan-planilha",
      enabled: true,
      balance: reais(15_000),
      depositRate: 0,
      annualYield: 0,
      withdrawalEveryMonths: 0,
      firstWithdrawalMonth: "2027-06" as YearMonth,
    };
    const com = project({ extraAmortizations: [extra("2027-06", 10_000)], fgts });
    const junho = monthOf(com, "2027-06");

    expect(junho.fgtsAmortization).toBe(reais(15_000));
    expect(junho.extraAmortization).toBe(reais(25_000));
  });
});

describe("o efeito escolhido vale para a amortização do bolso", () => {
  const depois = (r: ReturnType<typeof project>) => monthOf(r, "2028-06").installment;

  it.each([AmortizationSystem.SAC, AmortizationSystem.PRICE])(
    "%s: reduzir parcela deixa a parcela menor que reduzir prazo",
    (system) => {
      const extras = [extra("2027-06", 40_000)];
      const prazo = project({
        financing: {
          ...contract,
          system,
          extraAmortizationEffect: ExtraAmortizationEffect.SHORTEN_TERM,
        },
        extraAmortizations: extras,
      });
      const parcela = project({
        financing: {
          ...contract,
          system,
          extraAmortizationEffect: ExtraAmortizationEffect.REDUCE_INSTALLMENT,
        },
        extraAmortizations: extras,
      });

      expect(depois(parcela)).toBeLessThan(depois(prazo));
    }
  );

  it("reduzir prazo deixa menos dívida no fim do horizonte", () => {
    const extras = [extra("2027-06", 40_000)];
    const prazo = project({
      financing: { ...contract, extraAmortizationEffect: ExtraAmortizationEffect.SHORTEN_TERM },
      extraAmortizations: extras,
    });
    const parcela = project({
      financing: {
        ...contract,
        extraAmortizationEffect: ExtraAmortizationEffect.REDUCE_INSTALLMENT,
      },
      extraAmortizations: extras,
    });

    expect((prazo.months.at(-1)!.debt as Cents) < (parcela.months.at(-1)!.debt as Cents)).toBe(
      true
    );
  });
});
