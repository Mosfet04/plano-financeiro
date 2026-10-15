import { describe, expect, it } from "vitest";

import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import type { Investment } from "@/core/domain/investment/investment.entity";
import { projectPlan, type ProjectionInput } from "@/core/domain/projection/project-plan";
import { reais, type Cents } from "@/core/domain/shared/money";
import { addMonths, isBefore, type YearMonth } from "@/core/domain/shared/month";
import { spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

/**
 * Guarda `amount` a mais em cada mês de `from` a `to`. Entra como aplicação que
 * vence no mês, sem rendimento: cai no caixa do mês como sobra, sem mexer no
 * custo de vida — que é o que dimensiona a reserva.
 */
function withExtraSaving(
  input: ProjectionInput,
  amount: Cents,
  from: YearMonth,
  to: YearMonth
): ProjectionInput {
  const extra: Investment[] = [];
  for (let month = from; !isBefore(to, month); month = addMonths(month, 1)) {
    extra.push({
      id: `extra-${month}`,
      planId: "plan-planilha",
      name: "Reforço",
      amount,
      maturityDate: `${month}-15`,
      indexer: "CDI_PCT",
      indexerValue: 0,
      taxExempt: true,
      instruction: null,
    });
  }
  return {
    ...input,
    investments: [...input.investments, ...extra],
    options: { ...input.options, accrueInvestments: false },
  };
}

function cashIn(input: ProjectionInput, month: YearMonth): Cents {
  return projectPlan(input).months.find((row) => row.month === month)!.payoffCash;
}

describe("reforço para fechar o buraco", () => {
  it("guardado todo mês até o buraco, fecha o buraco sem passar dele uma parcela", () => {
    const base = {
      ...spreadsheetProjectionInput(),
      options: { ...spreadsheetProjectionInput().options, accrueInvestments: false },
    };
    const plan = projectPlan(base);
    expect(plan.minCash).toBeLessThan(0);

    const holeMonth = plan.minCashMonth!;
    const after = cashIn(
      withExtraSaving(base, plan.monthlyTopUpToFixHole, plan.startMonth, holeMonth),
      holeMonth
    );

    // Fecha, e a folga é só rendimento e arredondamento — não um reforço inteiro.
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThan(plan.monthlyTopUpToFixHole / 2);
  });

  it("primeiro mês conferido no meio dele não deposita, e sai da divisão", () => {
    const base = spreadsheetProjectionInput();
    const account: CashAccount = {
      id: "nu",
      planId: "plan-planilha",
      name: "Caixinha",
      balance: reais(0),
      indexer: null,
      indexerValue: 0,
      taxExempt: false,
      checkedOn: "2026-08-10",
    };
    const input: ProjectionInput = {
      ...base,
      cashAccounts: [account],
      options: { ...base.options, accrueInvestments: false },
    };
    const plan = projectPlan(input);
    expect(plan.months[0].toReserve + plan.months[0].toPayoffCash).toBe(0);
    expect(plan.minCash).toBeLessThan(0);

    // Agosto não deposita: o reforço é guardado de setembro até o buraco.
    const holeMonth = plan.minCashMonth!;
    const after = cashIn(
      withExtraSaving(input, plan.monthlyTopUpToFixHole, addMonths(plan.startMonth, 1), holeMonth),
      holeMonth
    );

    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThan(plan.monthlyTopUpToFixHole / 2);
  });
});

describe("metas na projeção", () => {
  const base = spreadsheetProjectionInput();
  const itbi = base.goals.find((goal) => goal.name.startsWith("ITBI"))!;
  const withItbi = (status: "PLANNED" | "DONE" | "CANCELLED") =>
    projectPlan({
      ...base,
      goals: base.goals.map((goal) => (goal.id === itbi.id ? { ...goal, status } : goal)),
    }).months.find((row) => row.month === itbi.targetMonth)!;

  /**
   * A regressão do ITBI: concluir a meta no mês dela tirava o valor da meta do
   * mês enquanto o pagamento continuava saindo da sobra realizada.
   */
  it("concluída continua saindo no mês dela", () => {
    expect(withItbi("DONE").goals).toBe(withItbi("PLANNED").goals);
    expect(withItbi("DONE").leftover).toBe(withItbi("PLANNED").leftover);
  });

  it("cancelada sai da conta", () => {
    expect(withItbi("CANCELLED").goals).toBe(withItbi("PLANNED").goals - itbi.amount);
  });
});
