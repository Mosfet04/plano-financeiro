import { describe, expect, it, vi } from "vitest";

import type { Clock, PlanRepository, TransactionRepository } from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import { boostFor, setBoostFrom, type SavingsBoost } from "@/core/domain/plan/savings-boost.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { projectPlan } from "@/core/domain/projection/project-plan";
import { reais } from "@/core/domain/shared/money";
import { monthOf, type YearMonth } from "@/core/domain/shared/month";
import {
  ratesSnapshot,
  spreadsheetPlan,
  spreadsheetProjectionInput,
} from "../../fixtures/plano-da-planilha";

const boost = (
  amount: number,
  startsOn: YearMonth,
  endsOn: YearMonth | null = null,
  id = `b-${startsOn}`
): SavingsBoost => ({ id, planId: "plan-1", startsOn, endsOn, amount: reais(amount), note: null });

describe("setBoostFrom", () => {
  it("substitui do mês em diante: o anterior termina no mês de antes", () => {
    const result = setBoostFrom(
      [boost(300, monthOf(2026, 11))],
      { startsOn: monthOf(2027, 2), endsOn: null, amount: reais(500) },
      { planId: "plan-1", newId: "novo" }
    );

    expect(result).toEqual([
      boost(300, monthOf(2026, 11), monthOf(2027, 1)),
      boost(500, monthOf(2027, 2), null, "novo"),
    ]);
  });

  it("apaga o que começava depois, e zero tira sem criar linha", () => {
    const result = setBoostFrom(
      [boost(300, monthOf(2026, 11), monthOf(2026, 12)), boost(400, monthOf(2027, 3))],
      { startsOn: monthOf(2027, 1), endsOn: null, amount: reais(0) },
      { planId: "plan-1", newId: "novo" }
    );

    // O de nov–dez já tinha acabado: fica intacto. O de março some.
    expect(result).toEqual([boost(300, monthOf(2026, 11), monthOf(2026, 12))]);
  });

  it("nunca passa do orçamento variável", () => {
    expect(boostFor([boost(5_000, monthOf(2026, 11))], monthOf(2026, 11), reais(1_450))).toBe(
      reais(1_450)
    );
    expect(boostFor([boost(300, monthOf(2026, 11))], monthOf(2026, 10), reais(1_450))).toBe(0);
  });
});

describe("reforço na projeção", () => {
  it("a sobra sobe, a quitação adianta e o custo de vida (alvo da reserva) não muda", () => {
    const base = spreadsheetProjectionInput();
    const before = projectPlan(base);
    const after = projectPlan({ ...base, savingsBoosts: [boost(500, base.startMonth)] });

    const first = (p: typeof before) => p.months[0];
    expect(first(after).savingsBoost).toBe(reais(500));
    expect(first(after).variable).toBe(first(before).variable);
    expect(first(after).leftover).toBe(first(before).leftover + reais(500));
    expect(after.costOfLivingAfterMove).toBe(before.costOfLivingAfterMove);
    expect(after.payoffMonth! < before.payoffMonth!).toBe(true);
  });
});

describe("reforço no mês", () => {
  function closeMonthWith(boosts: SavingsBoost[], { withGoals = false } = {}) {
    const seeded = spreadsheetPlan();
    const snapshot: PlanSnapshot = {
      plan: seeded.plan,
      income: seeded.income,
      yieldPolicy: seeded.yieldPolicy,
      accrueInvestments: seeded.accrueInvestments,
      recurringItems: seeded.recurringItems,
      categories: seeded.categories,
      // Sem as metas o plano da planilha não tem buraco, e não há reforço automático.
      goals: withGoals ? seeded.goals : [],
      financing: seeded.financing,
      extraAmortizations: [],
      investments: seeded.investments,
      cashAccounts: [],
      closings: [],
      fgts: null,
      reserveTargets: seeded.reserveTargets,
      savingsBoosts: boosts,
      rates: ratesSnapshot,
    };
    const plans = {
      loadSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as PlanRepository;
    const transactions = {
      listByMonth: vi.fn().mockResolvedValue([]),
    } as unknown as TransactionRepository;
    const clock: Clock = {
      now: () => new Date("2026-08-01T12:00:00Z"),
      today: () => "2026-08-01",
    };
    return new CloseMonthUseCase(plans, transactions, clock).execute({
      planId: seeded.plan.id,
      month: monthOf(2026, 8),
    });
  }

  it("a meta sobe e o dinheiro do dia desce na mesma medida", async () => {
    const without = await closeMonthWith([]);
    const withBoost = await closeMonthWith([boost(310, monthOf(2026, 8))]);
    if (!without.ok || !withBoost.ok) throw new Error("fechamento falhou");

    expect(withBoost.value.planTarget).toBe(without.value.planTarget + reais(310));
    // Dia 1º de agosto, 31 dias: R$ 310 a menos no mês = R$ 10 a menos por dia.
    expect(without.value.allowance.cash.dayBudget - withBoost.value.allowance.cash.dayBudget).toBe(
      reais(10)
    );
  });

  it("com o caixa furado, o reforço voluntário é absorvido pelo automático", async () => {
    const without = await closeMonthWith([], { withGoals: true });
    const withBoost = await closeMonthWith([boost(310, monthOf(2026, 8))], { withGoals: true });
    if (!without.ok || !withBoost.ok) throw new Error("fechamento falhou");

    // A meta já cobrava o reforço que fecha o buraco. Guardar a mais ajuda a
    // fechá-lo e diminui esse reforço, então a meta quase não muda: o que
    // muda é que o buraco fecha mais cedo.
    expect(Math.abs(withBoost.value.planTarget - without.value.planTarget)).toBeLessThan(
      reais(100)
    );
  });
});
