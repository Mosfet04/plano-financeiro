import { describe, expect, it, vi } from "vitest";

import type { Clock, PlanRepository, TransactionRepository } from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import {
  buildProjectionInput,
  DEFAULT_HORIZON_MONTHS,
} from "@/core/application/use-cases/get-projection.use-case";
import { Indexer } from "@/core/domain/investment/investment.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { projectPlan } from "@/core/domain/projection/project-plan";
import { reais } from "@/core/domain/shared/money";
import { monthOf, type YearMonth } from "@/core/domain/shared/month";
import type { Transaction } from "@/core/domain/transaction/transaction.entity";
import { buildSpreadsheetPlan } from "@/infra/db/seed-data";
import { ratesSnapshot } from "../../fixtures/plano-da-planilha";

const AGOSTO = monthOf(2026, 8);

function seed() {
  let counter = 0;
  return buildSpreadsheetPlan({
    planId: "plan-1",
    userId: "user-1",
    nextId: () => `id-${++counter}`,
    liveMode: false,
  });
}

function snapshotFrom(seeded: ReturnType<typeof seed>): PlanSnapshot {
  return {
    plan: seeded.plan,
    income: seeded.income,
    yieldPolicy: seeded.yieldPolicy,
    accrueInvestments: seeded.accrueInvestments,
    recurringItems: seeded.recurringItems,
    categories: seeded.categories,
    goals: seeded.goals,
    financing: seeded.financing,
    extraAmortizations: [],
    investments: seeded.investments,
    cashAccounts: [],
    closings: [],
    fgts: null,
    reserveTargets: seeded.reserveTargets,
    savingsBoosts: [],
    rates: ratesSnapshot,
  };
}

function build(transactions: Transaction[], seeded = seed(), today = "2026-08-27") {
  const plans = {
    loadSnapshot: vi.fn().mockResolvedValue(snapshotFrom(seeded)),
  } as unknown as PlanRepository;

  const repo = {
    listByMonth: vi.fn().mockResolvedValue(transactions),
  } as unknown as TransactionRepository;

  // Por padrão, dia 27 de agosto: faltam 5 dias no mês (27 a 31).
  const clock: Clock = { now: () => new Date(`${today}T12:00:00Z`), today: () => today };

  return { useCase: new CloseMonthUseCase(plans, repo, clock), seeded };
}

/** `amount` vem em reais para o teste ficar legível; vira centavos aqui. */
function expense(partial: Omit<Partial<Transaction>, "amount"> & { amount: number }): Transaction {
  return {
    id: `t-${Math.random()}`,
    planId: "plan-1",
    date: "2026-08-10",
    description: "Teste",
    kind: "EXPENSE",
    categoryId: null,
    goalId: null,
    paymentMethod: "CASH",
    clientRequestId: null,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    ...partial,
    amount: reais(partial.amount),
  };
}

describe("CloseMonthUseCase", () => {
  it("mês sem lançamentos: sobra é o salário menos as contas fixas do mês", async () => {
    const { useCase, seeded } = build([]);

    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const closing = result.value;
    // Agosto ainda tem aluguel (1.233,57) + as cinco fixas (608,26).
    expect(closing.fixedTotal).toBe(reais(1841.83));
    expect(closing.leftover).toBe(reais(6354.88 - 1841.83));
    expect(closing.mealCardRemaining).toBe(seeded.income.mealCardMonthly);
    expect(closing.allowance.cash.daysLeft).toBe(5);
  });

  it("só gasto em dinheiro consome o orçamento da categoria", async () => {
    const { seeded } = build([]);
    const transporte = seeded.categories.find((c) => c.name === "Transporte")!;

    const { useCase } = build(
      [
        expense({ amount: 100, categoryId: transporte.id, paymentMethod: "CASH" }),
        // Mesmo com categoria, o que sai do vale-refeição não entra no orçamento.
        expense({ amount: 80, categoryId: transporte.id, paymentMethod: "MEAL_CARD" }),
      ],
      seeded
    );

    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const categoria = result.value.categories.find((c) => c.category.id === transporte.id)!;
    expect(categoria.spent).toBe(reais(100));
    expect(categoria.remaining).toBe(reais(150));
    expect(categoria.usedRatio).toBeCloseTo(0.4, 10);
    expect(result.value.mealCardSpent).toBe(reais(80));
  });

  it("estouro do vale-refeição sai do bolso e derruba a sobra", async () => {
    const { useCase } = build([
      expense({ amount: 2300, paymentMethod: "MEAL_CARD", categoryId: null }),
    ]);

    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Entraram 2.100 e gastaram 2.300: 200 viraram despesa de verdade.
    expect(result.value.mealCardRemaining).toBe(reais(-200));
    expect(result.value.mealCardOverflow).toBe(reais(200));
    expect(result.value.leftover).toBe(reais(6354.88 - 1841.83 - 200));
  });

  it("renda extra entra na sobra e gasto de meta sai dela", async () => {
    const { seeded } = build([]);
    const meta = seeded.goals[0];

    const { useCase } = build(
      [
        expense({ amount: 500, kind: "EXTRA_INCOME", categoryId: null }),
        expense({ amount: 300, kind: "GOAL", goalId: meta.id, categoryId: null }),
      ],
      seeded
    );

    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.extraIncome).toBe(reais(500));
    expect(result.value.goalSpent).toBe(reais(300));
    expect(result.value.leftover).toBe(reais(6354.88 + 500 - 1841.83 - 300));
    // Gasto de meta não aparece em nenhuma categoria do orçamento.
    expect(result.value.variableSpent).toBe(reais(0));
  });

  it("compara com a meta do plano e divide o Dinheiro do mês pelos dias que faltam", async () => {
    const { useCase } = build([]);

    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const closing = result.value;
    // A meta soma a sobra projetada de agosto com o reforço do buraco de dez/2026.
    expect(closing.planTarget).toBeGreaterThan(reais(3063.05));
    expect(closing.slack).toBe(closing.leftover - closing.planTarget);
    expect(closing.onPlan).toBe(closing.leftover >= closing.planTarget);
    // Sem lançamento, o Dinheiro do mês é a folga: categorias − reforço.
    expect(closing.allowance.cash.monthRemaining).toBe(closing.slack);
    expect(closing.allowance.cash.dayBudget).toBe(Math.floor(closing.slack / 5));
  });

  /**
   * A regressão do "Livre por dia": o realizado contava só o salário e a meta
   * contava o 13º, então novembro abria R$ 2 mil abaixo do plano sem nenhum
   * gasto. Agora renda, moradia e parcela vêm da mesma linha da meta.
   */
  it.each(["2026-11", "2026-12", "2027-03"])(
    "%s sem lançamento: o Dinheiro do mês é categorias − reforço",
    async (month) => {
      const seeded = seed();
      const { useCase } = build([], seeded, `${month}-01`);

      const result = await useCase.execute({ planId: "plan-1", month: month as YearMonth });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const variable = seeded.categories.reduce((sum, c) => sum + c.monthlyBudget, 0);
      const { monthlyTopUpToFixHole } = projectPlan(
        buildProjectionInput(snapshotFrom(seeded), `${month}-01`, DEFAULT_HORIZON_MONTHS)
      );
      // A folga ainda conta a meta prevista e não lançada (o ITBI de dezembro);
      // o Dinheiro já a tirou como "gasto que vai entrar".
      const goalsDue = seeded.goals
        .filter((goal) => goal.targetMonth === month)
        .reduce((sum, goal) => sum + goal.amount, 0);
      expect(result.value.slack).toBe(variable + goalsDue - monthlyTopUpToFixHole);
      expect(result.value.allowance.cash.monthRemaining).toBe(variable - monthlyTopUpToFixHole);
    }
  );

  /**
   * A regressão da virada: conferidos os saldos em 01/11, a projeção começa em
   * novembro e outubro sai dela. A meta de outubro caía na sobra de novembro —
   * e era exatamente a ordem que a tela pedia (confira os saldos, depois feche).
   * Novembro tem 13º, então as duas sobras são bem diferentes.
   */
  it("mês que já saiu da projeção mantém a meta dele, não a do mês seguinte", async () => {
    const seeded = seed();
    const snapshot: PlanSnapshot = {
      ...snapshotFrom(seeded),
      // Caixa folgado para o plano não ter buraco: sem reforço, a meta é só a sobra.
      cashAccounts: [
        {
          id: "nu",
          planId: "plan-1",
          name: "Caixinha",
          balance: reais(200_000),
          indexer: Indexer.CDI_PCT,
          indexerValue: 1,
          taxExempt: false,
          checkedOn: "2026-11-01",
        },
      ],
    };
    const plans = {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as PlanRepository;
    const repo = { listByMonth: vi.fn().mockResolvedValue([]) } as unknown as TransactionRepository;
    const clock: Clock = { now: () => new Date("2026-11-01T12:00:00Z"), today: () => "2026-11-01" };

    const result = await new CloseMonthUseCase(plans, repo, clock).execute({
      planId: "plan-1",
      month: monthOf(2026, 10),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const continuous = projectPlan(
      buildProjectionInput(snapshotFrom(seeded), "2026-11-01", DEFAULT_HORIZON_MONTHS)
    );
    const outubro = continuous.months.find((m) => m.month === "2026-10")!;
    const novembro = continuous.months.find((m) => m.month === "2026-11")!;

    expect(outubro.leftover).not.toBe(novembro.leftover);
    expect(result.value.planTarget).toBe(outubro.leftover);
  });

  it("plano inexistente devolve erro em vez de estourar", async () => {
    const plans = { loadSnapshot: vi.fn().mockResolvedValue(null) } as unknown as PlanRepository;
    const repo = { listByMonth: vi.fn() } as unknown as TransactionRepository;
    const clock: Clock = { now: () => new Date(), today: () => "2026-08-27" };

    const result = await new CloseMonthUseCase(plans, repo, clock).execute({
      planId: "nao-existe",
      month: AGOSTO,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PLAN_NOT_FOUND");
  });
});
