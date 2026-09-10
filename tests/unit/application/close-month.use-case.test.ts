import { describe, expect, it, vi } from "vitest";

import type { Clock, PlanRepository, TransactionRepository } from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { reais } from "@/core/domain/shared/money";
import { monthOf } from "@/core/domain/shared/month";
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
    rates: ratesSnapshot,
  };
}

function build(transactions: Transaction[], seeded = seed()) {
  const plans = {
    loadSnapshot: vi.fn().mockResolvedValue(snapshotFrom(seeded)),
  } as unknown as PlanRepository;

  const repo = {
    listByMonth: vi.fn().mockResolvedValue(transactions),
  } as unknown as TransactionRepository;

  // Dia 27 de agosto: faltam 5 dias no mês (27 a 31).
  const clock: Clock = { now: () => new Date("2026-08-27T12:00:00Z"), today: () => "2026-08-27" };

  return { useCase: new CloseMonthUseCase(plans, repo, clock), seeded };
}

/** `amount` vem em reais para o teste ficar legível; vira centavos aqui. */
function expense(
  partial: Omit<Partial<Transaction>, "amount"> & { amount: number }
): Transaction {
  return {
    id: `t-${Math.random()}`,
    planId: "plan-1",
    date: "2026-08-10",
    description: "Teste",
    kind: "EXPENSE",
    categoryId: null,
    goalId: null,
    paymentMethod: "CASH",
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
    expect(closing.daysRemaining).toBe(5);
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

  it("compara com a meta do plano e divide a folga pelos dias que faltam", async () => {
    const { useCase } = build([]);

    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const closing = result.value;
    // A meta soma a sobra projetada de agosto com o reforço do buraco de dez/2026.
    expect(closing.planTarget).toBeGreaterThan(reais(3063.05));
    expect(closing.slack).toBe(closing.leftover - closing.planTarget);
    expect(closing.onPlan).toBe(closing.leftover >= closing.planTarget);
    expect(closing.freePerDay).toBe(Math.round(Math.max(0, closing.slack) / closing.daysRemaining));
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
