import { describe, expect, it, vi } from "vitest";

import type {
  BudgetCategoryRepository,
  Clock,
  FinancingRepository,
  GoalRepository,
  PlanRepository,
  PlanReviewRepository,
  TransactionRepository,
} from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import { PlanReviewUseCase } from "@/core/application/use-cases/plan-review.use-case";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import {
  applyChanges,
  SuggestionKind,
  SuggestionStatus,
  type PlanSuggestion,
  type SuggestionChange,
} from "@/core/domain/review/plan-review.entity";
import { reais } from "@/core/domain/shared/money";
import { monthOf } from "@/core/domain/shared/month";
import { buildSpreadsheetPlan } from "@/infra/db/seed-data";
import { ratesSnapshot } from "../../fixtures/plano-da-planilha";

function snapshot(): PlanSnapshot {
  let counter = 0;
  const seeded = buildSpreadsheetPlan({
    planId: "plan-1",
    userId: "user-1",
    nextId: () => `id-${++counter}`,
    liveMode: false,
  });
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

const goalNamed = (plan: PlanSnapshot, name: string) =>
  plan.goals.find((goal) => goal.name.startsWith(name))!;

function build(plan = snapshot()) {
  const stored: PlanSuggestion[] = [];
  let counter = 0;

  const plans = { loadSnapshot: vi.fn().mockResolvedValue(plan) } as unknown as PlanRepository;
  const transactions = {
    listByMonth: vi.fn().mockResolvedValue([]),
  } as unknown as TransactionRepository;
  const reviews: PlanReviewRepository = {
    listRecent: vi.fn().mockResolvedValue([]),
    submit: vi.fn(async (_review, suggestions) => void stored.push(...suggestions)),
    findSuggestion: vi.fn(async (id) => stored.find((s) => s.id === id) ?? null),
    saveSuggestion: vi.fn(async (suggestion) => {
      const index = stored.findIndex((s) => s.id === suggestion.id);
      stored[index] = suggestion;
    }),
  };
  const categories = {
    findById: vi.fn(async (id: string) => plan.categories.find((c) => c.id === id) ?? null),
    save: vi.fn(),
  } as unknown as BudgetCategoryRepository;
  const goals = {
    findById: vi.fn(async (id: string) => plan.goals.find((g) => g.id === id) ?? null),
    save: vi.fn(),
  } as unknown as GoalRepository;
  const financings = {
    findByPlan: vi.fn().mockResolvedValue(plan.financing),
    saveExtraAmortization: vi.fn(),
  } as unknown as FinancingRepository;

  const clock: Clock = {
    now: () => new Date("2026-10-02T12:00:00Z"),
    today: () => "2026-10-02",
  };
  const closeMonth = new CloseMonthUseCase(plans, transactions, clock);
  const useCase = new PlanReviewUseCase(
    plans,
    closeMonth,
    reviews,
    categories,
    goals,
    financings,
    { generate: () => `gen-${++counter}` },
    clock
  );

  return { useCase, plan, stored, reviews, categories, goals, financings };
}

describe("applyChanges", () => {
  it("recusa categoria ou meta que não é do plano", () => {
    const plan = snapshot();
    const category = applyChanges(plan, [
      {
        kind: SuggestionKind.SET_CATEGORY_BUDGET,
        categoryId: "outro-plano",
        monthlyBudget: reais(1),
      },
    ]);
    expect(!category.ok && category.error.code).toBe("CATEGORY_NOT_FOUND");

    const goal = applyChanges(plan, [
      { kind: SuggestionKind.MOVE_GOAL, goalId: "outro-plano", targetMonth: monthOf(2027, 1) },
    ]);
    expect(!goal.ok && goal.error.code).toBe("GOAL_NOT_FOUND");
  });

  it("amortização no mesmo mês sobrescreve, como o índice único do banco", () => {
    const plan = snapshot();
    const change = (amount: number): SuggestionChange => ({
      kind: SuggestionKind.ADD_EXTRA_AMORTIZATION,
      month: monthOf(2028, 1),
      amount: reais(amount),
    });

    const result = applyChanges(plan, [change(5_000), change(8_000)]);
    if (!result.ok) throw result.error;
    expect(result.value.extraAmortizations).toHaveLength(1);
    expect(result.value.extraAmortizations[0].amount).toBe(reais(8_000));
  });

  it("não mexe no snapshot original", () => {
    const plan = snapshot();
    const category = plan.categories[0];
    applyChanges(plan, [
      {
        kind: SuggestionKind.SET_CATEGORY_BUDGET,
        categoryId: category.id,
        monthlyBudget: reais(1),
      },
    ]);
    expect(plan.categories[0].monthlyBudget).toBe(category.monthlyBudget);
  });
});

describe("PlanReviewUseCase", () => {
  it("o impacto vem do motor: adiar o ITBI para depois do buraco melhora o menor caixa", async () => {
    const { useCase, plan } = build();
    const itbi = goalNamed(plan, "ITBI");

    const simulated = await useCase.simulate("plan-1", [
      { kind: SuggestionKind.MOVE_GOAL, goalId: itbi.id, targetMonth: monthOf(2027, 12) },
    ]);
    if (!simulated.ok) throw simulated.error;

    // O plano da planilha fica no vermelho em dez/2026 por causa do ITBI.
    expect(simulated.value.minCashBefore).toBeLessThan(0);
    expect(simulated.value.minCashAfter).toBeGreaterThan(simulated.value.minCashBefore);
  });

  it("submit mede o impacto de cada sugestão sozinha e grava como pendente", async () => {
    const { useCase, plan, stored } = build();
    const itbi = goalNamed(plan, "ITBI");

    const result = await useCase.submit({
      planId: "plan-1",
      summary: "Outubro: o buraco de dezembro continua.",
      suggestions: [
        {
          title: "Adiar o ITBI",
          rationale: "Tira o caixa do vermelho.",
          change: {
            kind: SuggestionKind.MOVE_GOAL,
            goalId: itbi.id,
            targetMonth: monthOf(2027, 12),
          },
        },
        {
          title: "Conferir a caixinha",
          rationale: "Está há 40 dias sem conferência.",
          change: { kind: SuggestionKind.NOTE },
        },
      ],
    });
    if (!result.ok) throw result.error;

    expect(result.value.review.month).toBe("2026-10");
    expect(stored).toHaveLength(2);
    expect(stored.every((s) => s.status === SuggestionStatus.PENDING)).toBe(true);
    expect(stored[0].impact?.minCashAfter).toBeGreaterThan(stored[0].impact!.minCashBefore);
    expect(stored[1].impact).toBeNull();
  });

  it("uma sugestão inválida derruba a revisão inteira", async () => {
    const { useCase, reviews } = build();

    const result = await useCase.submit({
      planId: "plan-1",
      summary: "…",
      suggestions: [
        {
          title: "Categoria fantasma",
          rationale: "…",
          change: {
            kind: SuggestionKind.SET_CATEGORY_BUDGET,
            categoryId: "nao-existe",
            monthlyBudget: reais(100),
          },
        },
      ],
    });

    expect(!result.ok && result.error.code).toBe("CATEGORY_NOT_FOUND");
    expect(reviews.submit).not.toHaveBeenCalled();
  });

  it("aplicar grava a mudança; recusar não toca no plano; decidir duas vezes não vale", async () => {
    const { useCase, plan, categories, stored } = build();
    const category = plan.categories[0];

    await useCase.submit({
      planId: "plan-1",
      summary: "…",
      suggestions: [
        {
          title: "Orçamento realista",
          rationale: "Estourou três meses seguidos.",
          change: {
            kind: SuggestionKind.SET_CATEGORY_BUDGET,
            categoryId: category.id,
            monthlyBudget: reais(950),
          },
        },
        { title: "Só um aviso", rationale: "…", change: { kind: SuggestionKind.NOTE } },
      ],
    });
    const [budget, note] = stored;

    const applied = await useCase.decide("plan-1", budget.id, true);
    expect(applied.ok && applied.value.status).toBe(SuggestionStatus.APPLIED);
    expect(categories.save).toHaveBeenCalledWith({ ...category, monthlyBudget: reais(950) });

    const again = await useCase.decide("plan-1", budget.id, false);
    expect(!again.ok && again.error.code).toBe("SUGGESTION_ALREADY_DECIDED");

    const dismissed = await useCase.decide("plan-1", note.id, false);
    expect(dismissed.ok && dismissed.value.status).toBe(SuggestionStatus.DISMISSED);
    expect(categories.save).toHaveBeenCalledTimes(1);
  });

  it("sugestão de outro plano não é decidida", async () => {
    const { useCase, stored } = build();
    await useCase.submit({
      planId: "plan-1",
      summary: "…",
      suggestions: [{ title: "Aviso", rationale: "…", change: { kind: SuggestionKind.NOTE } }],
    });

    const result = await useCase.decide("plan-2", stored[0].id, true);
    expect(!result.ok && result.error.code).toBe("SUGGESTION_NOT_FOUND");
  });

  it("aplicar amortização grava no financiamento do plano", async () => {
    const { useCase, plan, financings, stored } = build();
    await useCase.submit({
      planId: "plan-1",
      summary: "…",
      suggestions: [
        {
          title: "Amortizar",
          rationale: "…",
          change: {
            kind: SuggestionKind.ADD_EXTRA_AMORTIZATION,
            month: monthOf(2028, 1),
            amount: reais(10_000),
          },
        },
      ],
    });

    await useCase.decide("plan-1", stored[0].id, true);
    expect(financings.saveExtraAmortization).toHaveBeenCalledWith(
      expect.objectContaining({
        financingId: plan.financing!.id,
        month: "2028-01",
        amount: reais(10_000),
      })
    );
  });

  it("overview traz ids, gasto por categoria e a virada pendente", async () => {
    const { useCase, plan } = build();
    const overview = await useCase.overview("plan-1");
    if (!overview.ok) throw overview.error;

    expect(overview.value.month).toBe("2026-10");
    // Setembro não foi fechado e já acabou: a virada está pendente.
    expect(overview.value.pendingTurnover).toBe("2026-09");
    expect(overview.value.categories.map((c) => c.id)).toEqual(plan.categories.map((c) => c.id));
    expect(overview.value.spending.map((s) => s.month)).toEqual(["2026-08", "2026-09"]);
    expect(overview.value.headline.minCash).toBeLessThan(0);
  });
});
