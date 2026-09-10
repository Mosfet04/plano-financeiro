import { describe, expect, it } from "vitest";

import { isWithdrawalMonth, type FgtsSettings } from "@/core/domain/fgts/fgts.entity";
import { AmortizationSystem } from "@/core/domain/financing/financing.entity";
import { ExtraAmortizationEffect } from "@/core/domain/projection/amortization";
import { projectPlan, type ProjectionInput } from "@/core/domain/projection/project-plan";
import { reais } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";
import { spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

const base = spreadsheetProjectionInput();
const contract = base.financing!;

function fgts(over: Partial<FgtsSettings> = {}): FgtsSettings {
  return {
    planId: "plan-planilha",
    enabled: true,
    balance: reais(18_000),
    depositRate: 0.08,
    annualYield: 0.03,
    withdrawalEveryMonths: 24,
    firstWithdrawalMonth: "2027-12" as YearMonth,
    ...over,
  };
}

const project = (over: Partial<ProjectionInput> = {}) => projectPlan({ ...base, ...over });
const withdrawals = (r: ReturnType<typeof project>) =>
  r.months.filter((m) => m.fgtsAmortization > 0);

describe("cadência de saque", () => {
  it("libera no primeiro mês e a cada 24 meses", () => {
    const settings = fgts();
    expect(isWithdrawalMonth(settings, 0)).toBe(true);
    expect(isWithdrawalMonth(settings, 12)).toBe(false);
    expect(isWithdrawalMonth(settings, 24)).toBe(true);
    expect(isWithdrawalMonth(settings, 48)).toBe(true);
  });

  it("antes do primeiro mês liberado não saca", () => {
    expect(isWithdrawalMonth(fgts(), -1)).toBe(false);
  });

  it("desligado nunca saca", () => {
    expect(isWithdrawalMonth(fgts({ enabled: false }), 24)).toBe(false);
  });
});

describe("o FGTS na projeção", () => {
  it("desligado não muda nada", () => {
    const sem = project();
    const desligado = project({ fgts: fgts({ enabled: false }) });

    expect(desligado.payoffMonth).toBe(sem.payoffMonth);
    expect(desligado.months.every((m) => m.fgtsAmortization === 0)).toBe(true);
    expect(desligado.months.every((m) => m.fgtsBalance === 0)).toBe(true);
  });

  it("o saldo cresce com depósito e rendimento", () => {
    const result = project({ fgts: fgts() });
    const rows = result.months;

    // Depósito de 8% sobre o bruto, mais rendimento — cresce todo mês fora os
    // meses de saque.
    for (let i = 1; i < 12; i++) {
      expect(rows[i].fgtsBalance).toBeGreaterThan(rows[i - 1].fgtsBalance);
    }
  });

  it("saca a cada 24 meses, e o saldo zera no saque", () => {
    const result = project({ fgts: fgts() });
    const saques = withdrawals(result);

    expect(saques.length).toBeGreaterThanOrEqual(2);
    expect(saques[0].month).toBe("2027-12");
    expect(saques[1].month).toBe("2029-12");
    for (const saque of saques) expect(saque.fgtsBalance).toBe(0);
  });

  it("antecipa a quitação", () => {
    const sem = project();
    const com = project({ fgts: fgts() });

    expect(com.payoffMonth!.localeCompare(sem.payoffMonth!)).toBeLessThan(0);
  });

  /**
   * FGTS não é caixa: não dá para gastar, só abater dívida. Descontá-lo do caixa
   * de quitação cobrava o mesmo abatimento duas vezes — e chegava a ATRASAR a
   * quitação, o oposto de amortizar.
   */
  it("não passa pelo caixa: o menor caixa do plano não muda", () => {
    const sem = project();
    const com = project({ fgts: fgts() });

    expect(com.minCash).toBe(sem.minCash);
    expect(com.minCashMonth).toBe(sem.minCashMonth);
  });

  it("o saque nunca passa do saldo devedor", () => {
    const result = project({ fgts: fgts({ balance: reais(500_000) }) });
    const primeiro = withdrawals(result)[0];
    const anterior = result.months[result.months.indexOf(primeiro) - 1];

    expect(primeiro.fgtsAmortization).toBeLessThanOrEqual(anterior.debt);
    expect(primeiro.debt).toBe(0);
  });

  it("sem financiamento o FGTS não amortiza nada", () => {
    const result = project({ financing: null, fgts: fgts() });
    expect(result.months.every((m) => m.fgtsAmortization === 0)).toBe(true);
  });

  it("depósito zerado ainda saca o saldo que já existia", () => {
    const result = project({ fgts: fgts({ depositRate: 0 }) });
    const primeiro = withdrawals(result)[0];

    expect(primeiro.fgtsAmortization).toBeGreaterThan(reais(18_000));
    expect(primeiro.fgtsAmortization).toBeLessThan(reais(21_000));
  });
});

describe("FGTS nos dois sistemas e nos dois efeitos", () => {
  const cenarios = [
    [AmortizationSystem.SAC, ExtraAmortizationEffect.SHORTEN_TERM],
    [AmortizationSystem.SAC, ExtraAmortizationEffect.REDUCE_INSTALLMENT],
    [AmortizationSystem.PRICE, ExtraAmortizationEffect.SHORTEN_TERM],
    [AmortizationSystem.PRICE, ExtraAmortizationEffect.REDUCE_INSTALLMENT],
  ] as const;

  it.each(cenarios)("%s + %s antecipa a quitação sem mexer no caixa", (system, effect) => {
    const financing = { ...contract, system, extraAmortizationEffect: effect };
    const sem = project({ financing });
    const com = project({ financing, fgts: fgts() });

    expect(com.payoffMonth!.localeCompare(sem.payoffMonth!)).toBeLessThan(0);
    expect(com.minCash).toBe(sem.minCash);
  });

  it("reduzir parcela deixa a parcela menor que reduzir prazo", () => {
    const financing = { ...contract, system: AmortizationSystem.PRICE };
    const prazo = project({
      financing: { ...financing, extraAmortizationEffect: ExtraAmortizationEffect.SHORTEN_TERM },
      fgts: fgts(),
    });
    const parcela = project({
      financing: {
        ...financing,
        extraAmortizationEffect: ExtraAmortizationEffect.REDUCE_INSTALLMENT,
      },
      fgts: fgts(),
    });

    const depois = (r: ReturnType<typeof project>) =>
      r.months.find((m) => m.month === "2028-06")!.installment;

    expect(depois(parcela)).toBeLessThan(depois(prazo));
  });

  it("reduzir prazo quita antes de reduzir parcela", () => {
    const financing = { ...contract, system: AmortizationSystem.PRICE };
    const prazo = project({
      financing: { ...financing, extraAmortizationEffect: ExtraAmortizationEffect.SHORTEN_TERM },
      fgts: fgts(),
    });
    const parcela = project({
      financing: {
        ...financing,
        extraAmortizationEffect: ExtraAmortizationEffect.REDUCE_INSTALLMENT,
      },
      fgts: fgts(),
    });

    const dividaFinal = (r: ReturnType<typeof project>) => r.months.at(-1)!.debt;
    expect(dividaFinal(prazo)).toBeLessThan(dividaFinal(parcela));
  });
});
