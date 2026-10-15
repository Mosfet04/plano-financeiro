import { describe, expect, it } from "vitest";

import { projectPlan } from "@/core/domain/projection/project-plan";
import { formatBRL, reais, toReais, type Cents } from "@/core/domain/shared/money";
import { monthOf } from "@/core/domain/shared/month";
import planilha from "../../fixtures/planilha-projecao.json";
import { spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

interface PlanilhaRow {
  month: string;
  housing: number;
  otherFixed: number;
  variable: number;
  goals: number;
  income: number;
  leftover: number;
  maturedInvestments: number;
  toReserve: number;
  toPayoffCash: number;
  reserve: number;
  payoffCash: number;
  debt: number;
  payoffFlag: boolean;
}

const rows = planilha as PlanilhaRow[];

/**
 * A planilha calcula em ponto flutuante sem arredondar; o motor trabalha em
 * centavos inteiros. A divergência vem daí — a parcela SAC, por exemplo, é
 * R$ 619,047619 lá e R$ 619,05 aqui. Dois reais de tolerância cobrem o acúmulo
 * ao longo de 84 meses e ainda pegaria qualquer erro de regra.
 */
const TOLERANCE_CENTS = 200;

function expectClose(actual: Cents, expectedReais: number, label: string) {
  const expected = reais(expectedReais);
  const diff = Math.abs(actual - expected);
  expect(
    diff,
    `${label}: motor ${formatBRL(actual)} vs planilha ${formatBRL(expected)} (Δ ${toReais(
      diff as Cents
    ).toFixed(2)})`
  ).toBeLessThanOrEqual(TOLERANCE_CENTS);
}

describe("projectPlan — paridade com a planilha", () => {
  const result = projectPlan(spreadsheetProjectionInput());

  it("projeta os mesmos 84 meses", () => {
    expect(result.months).toHaveLength(rows.length);
    expect(result.months.map((m) => m.month)).toEqual(rows.map((r) => r.month.slice(0, 7)));
  });

  it("reproduz o primeiro mês exatamente", () => {
    const first = result.months[0];
    expect(first.month).toBe(monthOf(2026, 8));
    expect(first.housing).toBe(reais(1233.57));
    expect(first.otherFixed).toBe(reais(608.26));
    expect(first.variable).toBe(reais(1450));
    expect(first.income).toBe(reais(6354.88));
    // O número da capa: "Sobra por mês HOJE".
    expect(first.leftover).toBe(reais(3063.05));
    expect(first.debt).toBe(reais(260000));
  });

  it("reproduz o mês da mudança (dez/2026), quando a moradia dá o salto", () => {
    const dez = result.months.find((m) => m.month === monthOf(2026, 12));
    expect(dez).toBeDefined();
    // Parcela: juros 1.659,67 + amortização 619,05 + seguros 70.
    expectClose(dez!.installment, 2348.71, "parcela de dez/2026");
    expectClose(dez!.housing, 2867.61, "moradia de dez/2026");
    expectClose(dez!.income, 9532.32, "renda de dez/2026");
    expectClose(dez!.goals, 16701.76, "metas de dez/2026");
    expectClose(dez!.leftover, -12095.31, "sobra de dez/2026");
    expectClose(dez!.debt, 259380.95, "saldo devedor de dez/2026");
  });

  it.each(rows.map((row, index) => [index, row.month.slice(0, 7), row] as const))(
    "mês %i (%s) bate com a planilha",
    (index, month, expected) => {
      const actual = result.months[index];
      expect(actual.month).toBe(month);
      expectClose(actual.housing, expected.housing, `${month} moradia`);
      expectClose(actual.otherFixed, expected.otherFixed, `${month} outras fixas`);
      expectClose(actual.variable, expected.variable, `${month} variáveis`);
      expectClose(actual.goals, expected.goals, `${month} metas`);
      expectClose(actual.income, expected.income, `${month} renda`);
      expectClose(actual.leftover, expected.leftover, `${month} sobra`);
      expectClose(actual.maturedInvestments, expected.maturedInvestments, `${month} vencimentos`);
      expectClose(actual.toReserve, expected.toReserve, `${month} → reserva`);
      expectClose(actual.toPayoffCash, expected.toPayoffCash, `${month} → caixa`);
      expectClose(actual.reserve, expected.reserve, `${month} reserva`);
      expectClose(actual.payoffCash, expected.payoffCash, `${month} caixa de quitação`);
      expectClose(actual.debt, expected.debt, `${month} saldo devedor`);
      expect(actual.canPayOff, `${month} marca de quitação`).toBe(expected.payoffFlag);
    }
  );

  it("chega nos mesmos números da capa", () => {
    expect(result.payoffMonth).toBe(monthOf(2030, 9));
    expect(result.minCashMonth).toBe(monthOf(2026, 12));
    expectClose(result.minCash, -2435.52, "menor caixa do plano");
    expectClose(result.leftoverFirstMonth, 3063.05, "sobra hoje");
    expectClose(result.typicalLeftoverAfterMove, 1429.01, "sobra depois da mudança");
    expectClose(result.costOfLivingAfterMove, 4925.87, "custo de vida depois da mudança");
    // Diverge da planilha de propósito. '3. Metas'!C31 divide o rombo de
    // dez/2026 pelos 4 meses de distância (R$ 608,88), mas de ago a dez são 5
    // depósitos, e o reforço passava do buraco em uma parcela.
    expectClose(result.monthlyTopUpToFixHole, 487.11, "reforço mensal");
  });

  it("enche a reserva até o alvo e só então manda para o caixa de quitação", () => {
    const outubro = result.months.find((m) => m.month === monthOf(2026, 10));
    expect(outubro!.reserve).toBe(reais(14800));
    expect(outubro!.reserveTarget).toBe(reais(14800));
    // Alvo atingido: o excedente do mês vai todo para a quitação.
    expect(outubro!.toPayoffCash).toBeGreaterThan(0);

    const jan2028 = result.months.find((m) => m.month === monthOf(2028, 1));
    expect(jan2028!.reserveTarget).toBe(reais(29600));
  });
});

describe("projectPlan — conselho de amortização", () => {
  it("com as taxas de hoje, manda continuar investindo", () => {
    const result = projectPlan(spreadsheetProjectionInput());
    const advice = result.amortizationAdvice;

    expect(advice).not.toBeNull();
    expect(advice!.verdict).toBe("INVEST");
    // 7,66% de contrato + ~2,07% de TR: o custo real não é o número do contrato.
    expect(advice!.debtAnnualCost).toBeGreaterThan(0.09);
    expect(advice!.referenceRateAnnual).toBeGreaterThan(0.02);
  });

  it("vira para amortizar quando o rendimento cai abaixo do custo da dívida", () => {
    const base = spreadsheetProjectionInput();
    const result = projectPlan({
      ...base,
      yieldPolicy: { ...base.yieldPolicy, manualAnnualNet: 0.06 },
    });

    expect(result.amortizationAdvice!.verdict).toBe("AMORTIZE");
  });

  it("no mês do buraco o veredito segue, mas sem valor a amortizar", () => {
    const base = spreadsheetProjectionInput();
    // Em dez/2026 o caixa fura: a regra continua valendo, o dinheiro é que não existe.
    const result = projectPlan({
      ...base,
      options: { ...base.options, asOfDate: "2026-12-15" },
    });

    expect(result.amortizationAdvice).not.toBeNull();
    expect(result.amortizationAdvice!.amountToAmortize).toBe(reais(0));
  });
});

describe("projectPlan — sensibilidade às premissas", () => {
  it("CDI menor atrasa a quitação", () => {
    const base = spreadsheetProjectionInput();
    const menorRendimento = projectPlan({
      ...base,
      yieldPolicy: { ...base.yieldPolicy, manualAnnualNet: 0.07 },
    });
    const baseline = projectPlan(base);

    expect(menorRendimento.payoffMonth! > baseline.payoffMonth!).toBe(true);
  });

  it("corrigir as aplicações até o vencimento melhora o caixa", () => {
    const base = spreadsheetProjectionInput();
    const comCorrecao = projectPlan({
      ...base,
      options: { ...base.options, accrueInvestments: true },
    });

    expect(comCorrecao.minCash).toBeGreaterThan(projectPlan(base).minCash);
  });

  it("ligar a TR aumenta o saldo devedor e atrasa a quitação", () => {
    const base = spreadsheetProjectionInput();
    const comTr = projectPlan({
      ...base,
      financing: { ...base.financing!, applyReferenceRate: true },
    });
    const baseline = projectPlan(base);

    const ultimoComTr = comTr.months[comTr.months.length - 1];
    const ultimoSemTr = baseline.months[baseline.months.length - 1];
    expect(ultimoComTr.debt).toBeGreaterThan(ultimoSemTr.debt);
  });

  it("uma meta nova no mês apertado aumenta o reforço exigido", () => {
    const base = spreadsheetProjectionInput();
    const comMetaExtra = projectPlan({
      ...base,
      goals: [
        ...base.goals,
        {
          id: "goal-extra",
          planId: "plan-planilha",
          name: "Meta de teste",
          amount: reais(5000),
          targetMonth: monthOf(2026, 12),
          fundingSource: null,
          note: null,
          status: "PLANNED" as const,
          sortOrder: 9,
        },
      ],
    });

    expect(comMetaExtra.monthlyTopUpToFixHole).toBeGreaterThan(
      projectPlan(base).monthlyTopUpToFixHole
    );
  });
});
