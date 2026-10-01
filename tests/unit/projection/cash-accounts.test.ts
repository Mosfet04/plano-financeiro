import { describe, expect, it } from "vitest";

import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import { Indexer } from "@/core/domain/investment/investment.entity";
import { projectPlan, type ProjectionInput } from "@/core/domain/projection/project-plan";
import {
  blendedCashAnnualNet,
  cashAccountAnnualNet,
  estimatedYieldBetween,
} from "@/core/domain/projection/yield";
import { reais, toReais, type Cents } from "@/core/domain/shared/money";
import { ratesSnapshot, spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

function account(partial: Partial<CashAccount> & { balance: Cents }): CashAccount {
  return {
    id: "cash-1",
    planId: "plan-planilha",
    name: "Caixinha",
    indexer: Indexer.CDI_PCT,
    indexerValue: 1,
    taxExempt: false,
    // Antes do início do plano de propósito: os testes de alocação querem o mês
    // 0 depositando normalmente. O rebase tem bloco próprio, mais abaixo.
    checkedOn: "2026-07-31",
    ...partial,
  };
}

function withAccounts(accounts: readonly CashAccount[]): ProjectionInput {
  return { ...spreadsheetProjectionInput(), cashAccounts: accounts };
}

describe("caixa de abertura", () => {
  it("sem contas cadastradas abre em zero", () => {
    const result = projectPlan(withAccounts([]));
    expect(result.openingCash).toBe(0);
    expect(result.months[0].reserve).toBe(result.months[0].toReserve);
  });

  it("soma os saldos de todas as contas", () => {
    const result = projectPlan(
      withAccounts([
        account({ id: "a", name: "Nubank", balance: reais(4000) }),
        account({ id: "b", name: "PicPay", balance: reais(1500) }),
      ])
    );
    expect(result.openingCash).toBe(reais(5500));
  });

  it("enche a reserva até o alvo antes de sobrar para a quitação", () => {
    const result = projectPlan(withAccounts([account({ balance: reais(3000) })]));
    const first = result.months[0];

    // R$ 3.000 é menos que o alvo da reserva, então tudo fica na reserva e o
    // caixa de quitação do primeiro mês continua sendo só a sobra do mês.
    expect(first.toReserve).toBeGreaterThan(0);
    expect(first.reserve).toBe((reais(3000) + first.toReserve) as Cents);
    expect(first.toPayoffCash).toBe(0);
  });

  /**
   * A regressão que motivou a tabela: com o escalar `cashOnHand` todo dinheiro
   * acima do alvo ficava preso na reserva e não contava para a quitação. Era
   * por isso que só dava para lançar caixa extra como "aplicação já vencida".
   */
  it("o que passa do alvo da reserva escorre para o caixa de quitação", () => {
    const target = projectPlan(withAccounts([])).months[0].reserveTarget;
    const opening = (target + reais(10_000)) as Cents;

    const result = projectPlan(withAccounts([account({ balance: opening })]));
    const first = result.months[0];

    expect(first.reserve).toBe(target);
    expect(first.payoffCash).toBe((reais(10_000) + first.toPayoffCash) as Cents);
  });

  it("caixa extra antecipa a quitação", () => {
    const semCaixa = projectPlan(withAccounts([]));
    const comCaixa = projectPlan(withAccounts([account({ balance: reais(40_000) })]));

    expect(comCaixa.minCash).toBeGreaterThan(semCaixa.minCash);
    expect(comCaixa.payoffMonth!.localeCompare(semCaixa.payoffMonth!)).toBeLessThanOrEqual(0);
  });
});

describe("rendimento das contas de caixa", () => {
  it("a reserva capitaliza quando há conta que rende", () => {
    const result = projectPlan(withAccounts([account({ balance: reais(3000) })]));
    const second = result.months[1];

    expect(result.cashAnnualYield).toBeCloseTo(0.139 * (1 - 0.15), 6);
    expect(second.cashYield).toBeGreaterThan(0);
  });

  it("dinheiro em conta corrente não rende", () => {
    const parada = projectPlan(
      withAccounts([account({ balance: reais(3000), indexer: null, indexerValue: 0 })])
    );
    expect(parada.cashAnnualYield).toBe(0);

    // A reserva fica parada; o caixa de quitação continua rendendo pela
    // política do plano, que é dinheiro que ainda vai entrar.
    const [first, second] = parada.months;
    expect(second.reserve).toBe((first.reserve + second.toReserve) as Cents);
  });

  it("sem contas a reserva não rende — é o que reproduz a planilha", () => {
    const result = projectPlan(withAccounts([]));
    expect(result.cashAnnualYield).toBe(0);

    const reserveGrowth = result.months.map((m, i) =>
      i === 0 ? 0 : m.reserve - result.months[i - 1].reserve - m.toReserve
    );
    expect(reserveGrowth.every((delta) => delta === 0)).toBe(true);
  });

  it("a média é ponderada pelo saldo, não pela quantidade de contas", () => {
    const accounts = [
      account({ id: "a", balance: reais(9000), indexerValue: 1 }),
      account({ id: "b", balance: reais(1000), indexer: null, indexerValue: 0 }),
    ];
    const blended = blendedCashAnnualNet(accounts, ratesSnapshot, 0.15);
    const cdiNet = 0.139 * (1 - 0.15);

    expect(blended).toBeCloseTo(cdiNet * 0.9, 6);
  });

  it("isenta de IR rende a taxa bruta", () => {
    const isenta = blendedCashAnnualNet(
      [account({ balance: reais(1000), taxExempt: true })],
      ratesSnapshot,
      0.15
    );
    expect(isenta).toBeCloseTo(0.139, 6);
  });

  it("saldo total zero não divide por zero", () => {
    expect(blendedCashAnnualNet([account({ balance: reais(0) })], ratesSnapshot, 0.15)).toBe(0);
  });

  it("o rendimento do mês é o que de fato entrou no caixa", () => {
    const result = projectPlan(withAccounts([account({ balance: reais(20_000) })]));

    for (let i = 1; i < result.months.length; i++) {
      const previous = result.months[i - 1];
      const current = result.months[i];
      const growth =
        current.reserve -
        previous.reserve -
        current.toReserve +
        (current.payoffCash -
          previous.payoffCash -
          current.toPayoffCash +
          current.extraAmortization);

      expect(toReais(current.cashYield as Cents)).toBeCloseTo(growth / 100, 2);
    }
  });
});

describe("recomeço no mês conferido", () => {
  const planStart = spreadsheetProjectionInput().startMonth;

  it("a projeção começa no mês do saldo conferido", () => {
    const result = projectPlan(
      withAccounts([account({ balance: reais(3143), checkedOn: "2026-09-09" })])
    );

    expect(result.startMonth).toBe("2026-09");
    expect(result.settledOn).toBe("2026-09-09");
    expect(result.months[0].month).toBe("2026-09");
  });

  /**
   * O furo que motivou o rebase: o saldo conferido em 09/09 já contém o que foi
   * guardado em agosto e setembro. Replayar esses meses somava o mesmo dinheiro
   * duas vezes — uns R$ 6.100 inventados no plano real.
   */
  it("o mês conferido não deposita de novo", () => {
    const result = projectPlan(
      withAccounts([account({ balance: reais(3143), checkedOn: "2026-09-09" })])
    );
    const [first, second] = result.months;

    expect(first.reserve).toBe(reais(3143));
    expect(first.toReserve).toBe(0);
    expect(first.toPayoffCash).toBe(0);

    // O mês seguinte volta a acumular normalmente.
    expect(second.toReserve).toBeGreaterThan(0);
  });

  it("a sobra prevista do mês conferido continua visível, só não entra no caixa", () => {
    const result = projectPlan(
      withAccounts([account({ balance: reais(3143), checkedOn: "2026-09-09" })])
    );

    expect(result.months[0].leftover).toBeGreaterThan(0);
    expect(result.leftoverFirstMonth).toBe(result.months[0].leftover);
  });

  it("conferência anterior ao início do plano não move o começo", () => {
    const result = projectPlan(
      withAccounts([account({ balance: reais(3000), checkedOn: "2026-07-31" })])
    );

    expect(result.startMonth).toBe(planStart);
    expect(result.months[0].toReserve).toBeGreaterThan(0);
  });

  it("vale a conferência mais recente entre as contas", () => {
    const result = projectPlan(
      withAccounts([
        account({ id: "velha", balance: reais(1000), checkedOn: "2026-08-02" }),
        account({ id: "nova", balance: reais(2000), checkedOn: "2026-10-15" }),
      ])
    );

    expect(result.startMonth).toBe("2026-10");
    expect(result.openingCash).toBe(reais(3000));
  });

  it("sem contas a projeção começa onde o plano começa", () => {
    const result = projectPlan(withAccounts([]));
    expect(result.startMonth).toBe(planStart);
    expect(result.settledOn).toBeNull();
    expect(result.closedThrough).toBeNull();
  });
});

describe("aplicações contra a data conferida", () => {
  /** A gambiarra real: a LCI do BRB venceu em 08/09 e caiu na caixinha. */
  it("aplicação vencida até a data conferida não entra de novo", () => {
    const semConta = projectPlan(withAccounts([]));
    const venceuEmSetembro = semConta.months.find((m) => m.month === "2026-09")!.maturedInvestments;
    expect(venceuEmSetembro).toBeGreaterThan(0);

    const conferido = projectPlan(
      withAccounts([account({ balance: reais(3143), checkedOn: "2026-09-09" })])
    );
    expect(conferido.months[0].maturedInvestments).toBe(0);
  });

  it("aplicação que vence depois da conferência continua entrando", () => {
    const result = projectPlan(
      withAccounts([account({ balance: reais(3143), checkedOn: "2026-09-09" })])
    );
    const novembro = result.months.find((m) => m.month === "2026-11")!;

    expect(novembro.maturedInvestments).toBeGreaterThan(0);
  });
});

describe("rendimento estimado entre duas datas", () => {
  const conta = account({ balance: reais(10_000), checkedOn: "2026-09-10" });
  const taxa = cashAccountAnnualNet(conta, ratesSnapshot, 0.15);

  it("um ano inteiro rende a taxa líquida anual", () => {
    const rendeu = estimatedYieldBetween(conta, ratesSnapshot, 0.15, "2026-01-01", "2027-01-01");
    expect(toReais(rendeu)).toBeCloseTo(10_000 * taxa, 0);
  });

  it("21 dias rendem a fração composta do ano", () => {
    const rendeu = estimatedYieldBetween(conta, ratesSnapshot, 0.15, "2026-09-10", "2026-10-01");
    expect(toReais(rendeu)).toBeCloseTo(10_000 * (Math.pow(1 + taxa, 21 / 365) - 1), 1);
    expect(rendeu).toBeGreaterThan(0);
  });

  it("mesma data ou data anterior não rende", () => {
    expect(estimatedYieldBetween(conta, ratesSnapshot, 0.15, "2026-10-01", "2026-10-01")).toBe(0);
    expect(estimatedYieldBetween(conta, ratesSnapshot, 0.15, "2026-10-01", "2026-09-01")).toBe(0);
  });

  it("conta corrente não rende", () => {
    const corrente = account({ balance: reais(2_000), indexer: null });
    expect(estimatedYieldBetween(corrente, ratesSnapshot, 0.15, "2026-09-01", "2026-10-01")).toBe(
      0
    );
  });
});
