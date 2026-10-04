import { describe, expect, it, vi } from "vitest";

import type {
  BudgetCategoryRepository,
  Clock,
  PlanRepository,
  TransactionRepository,
} from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import { GetProjectionUseCase } from "@/core/application/use-cases/get-projection.use-case";
import {
  GetWatchSnapshotUseCase,
  RecordWatchTransactionUseCase,
  type WatchTransactionInput,
} from "@/core/application/use-cases/watch.use-case";
import type { BudgetCategory } from "@/core/domain/budget/budget-category.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { reais } from "@/core/domain/shared/money";
import type { Transaction } from "@/core/domain/transaction/transaction.entity";
import { buildSpreadsheetPlan } from "@/infra/db/seed-data";
import { ratesSnapshot } from "../../fixtures/plano-da-planilha";

const clock: Clock = { now: () => new Date("2026-10-15T15:00:00Z"), today: () => "2026-10-15" };

const mercado: BudgetCategory = {
  id: "cat-mercado",
  planId: "plan-1",
  name: "Mercado",
  monthlyBudget: reais(0),
  defaultPaymentMethod: "MEAL_CARD",
  color: "chart-1",
  icon: "shopping-cart",
  active: true,
  sortOrder: 0,
};

function recorder() {
  const saved = new Map<string, Transaction>();
  const transactions = {
    findByClientRequestId: async (planId: string, key: string) =>
      [...saved.values()].find((t) => t.planId === planId && t.clientRequestId === key) ?? null,
    save: async (t: Transaction) => void saved.set(t.id, t),
  } as unknown as TransactionRepository;
  const categories = {
    findById: async (id: string) => (id === mercado.id ? mercado : null),
  } as unknown as BudgetCategoryRepository;
  let counter = 0;
  const useCase = new RecordWatchTransactionUseCase(
    categories,
    transactions,
    { generate: () => `t-${++counter}` },
    clock
  );
  return { useCase, saved };
}

const input: WatchTransactionInput = {
  planId: "plan-1",
  idempotencyKey: "4b0f6a6e-0000-4000-8000-000000000001",
  amount: reais(23.9),
  paymentMethod: "MEAL_CARD",
  categoryId: mercado.id,
  date: "2026-10-15",
};

describe("RecordWatchTransactionUseCase", () => {
  it("grava com o nome da categoria e a chave do relógio", async () => {
    const { useCase, saved } = recorder();
    const result = await useCase.execute(input);

    expect(result.ok && result.value.replayed).toBe(false);
    const [transaction] = [...saved.values()];
    expect(transaction).toMatchObject({
      description: "Mercado",
      kind: "EXPENSE",
      paymentMethod: "MEAL_CARD",
      amount: reais(23.9),
      clientRequestId: input.idempotencyKey,
    });
  });

  it("reenvio com a mesma chave devolve o mesmo lançamento; com outro conteúdo, conflito", async () => {
    const { useCase, saved } = recorder();
    await useCase.execute(input);

    const replay = await useCase.execute(input);
    expect(replay.ok && replay.value.replayed).toBe(true);
    expect(saved.size).toBe(1);

    const conflict = await useCase.execute({ ...input, amount: reais(99) });
    expect(!conflict.ok && conflict.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it.each([
    ["2026-10-16", false],
    ["2026-10-08", true],
    ["2026-10-07", false],
  ])("data %s aceita: %s", async (date, accepted) => {
    const { useCase } = recorder();
    expect((await useCase.execute({ ...input, date })).ok).toBe(accepted);
  });

  it("categoria de outro plano não existe para o relógio", async () => {
    const { useCase } = recorder();
    const result = await useCase.execute({ ...input, categoryId: "cat-de-outro-plano" });
    expect(!result.ok && result.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("GetWatchSnapshotUseCase", () => {
  it("junta o dia, o ledger bruto, as categorias e o resumo do plano", async () => {
    let counter = 0;
    const seeded = buildSpreadsheetPlan({
      planId: "plan-1",
      userId: "user-1",
      nextId: () => `id-${++counter}`,
      liveMode: false,
    });
    const snapshot: PlanSnapshot = {
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
    const transporte = seeded.categories[0];
    const entries: Transaction[] = [
      {
        id: "t-1",
        planId: "plan-1",
        date: "2026-10-15",
        description: "Uber",
        kind: "EXPENSE",
        categoryId: transporte.id,
        goalId: null,
        paymentMethod: "CASH",
        amount: reais(20),
        clientRequestId: null,
        createdAt: new Date("2026-10-15T12:00:00Z"),
      },
    ];
    const plans = {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as PlanRepository;
    const transactions = {
      listByMonth: vi.fn().mockResolvedValue(entries),
    } as unknown as TransactionRepository;

    const useCase = new GetWatchSnapshotUseCase(
      new CloseMonthUseCase(plans, transactions, clock),
      new GetProjectionUseCase(plans, clock),
      clock
    );
    const result = await useCase.execute("plan-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const watch = result.value;

    expect(watch.month).toBe("2026-10");
    expect(watch.cash.daysLeft).toBe(17);
    expect(watch.cash.remainingToday).toBe(watch.cash.dayBudget - reais(20));
    expect(watch.ledger.cash.today).toBe(reais(20));
    expect(watch.ledger.mealCardCredit).toBe(seeded.income.mealCardMonthly);
    expect(watch.nextMonth.month).toBe("2026-11");
    expect(watch.categories.find((c) => c.id === transporte.id)?.cashSpent).toBe(reais(20));
    expect(watch.plan.payoffMonth).not.toBeNull();
  });
});
