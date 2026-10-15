import { describe, expect, it } from "vitest";

import type { Goal } from "@/core/domain/goal/goal.entity";
import { reais } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";
import {
  goalSpending,
  moveMealCardOverflow,
  spendingByDay,
} from "@/core/domain/spending/month-ledger";
import type { Transaction } from "@/core/domain/transaction/transaction.entity";

const OUTUBRO = "2026-10" as YearMonth;
const HOJE = "2026-10-15";

let counter = 0;
function tx(partial: Omit<Partial<Transaction>, "amount"> & { amount: number }): Transaction {
  counter++;
  return {
    id: `t-${counter}`,
    planId: "plan-1",
    date: "2026-10-10",
    description: "Teste",
    kind: "EXPENSE",
    categoryId: null,
    goalId: null,
    paymentMethod: "CASH",
    clientRequestId: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, counter)),
    ...partial,
    amount: reais(partial.amount),
  };
}

function goal(partial: Omit<Partial<Goal>, "amount"> & { amount: number }): Goal {
  return {
    id: "itbi",
    planId: "plan-1",
    name: "ITBI",
    targetMonth: OUTUBRO,
    fundingSource: null,
    note: null,
    status: "PLANNED",
    sortOrder: 0,
    ...partial,
    amount: reais(partial.amount),
  };
}

describe("spendingByDay", () => {
  it("separa por fonte e corta em hoje; data futura conta como hoje", () => {
    const result = spendingByDay(
      [
        tx({ amount: 10 }),
        tx({ amount: 20, date: HOJE }),
        tx({ amount: 5, date: "2026-10-20" }),
        tx({ amount: 30, paymentMethod: "MEAL_CARD" }),
        tx({ amount: 999, kind: "EXTRA_INCOME" }),
      ],
      [],
      OUTUBRO,
      HOJE
    );
    expect(result.cash).toEqual({ beforeToday: reais(10), today: reais(25) });
    expect(result.mealCard).toEqual({ beforeToday: reais(30), today: reais(0) });
  });

  it("lançamento de meta prevista no mês só conta no que passa dela", () => {
    const result = spendingByDay(
      [
        tx({ amount: 600, kind: "GOAL", goalId: "itbi" }),
        tx({ amount: 500, kind: "GOAL", goalId: "itbi", date: HOJE }),
      ],
      [goal({ amount: 1000 })],
      OUTUBRO,
      HOJE
    );
    expect(result.cash).toEqual({ beforeToday: reais(0), today: reais(100) });
  });

  it("meta concluída no mês continua cobrindo; cancelada ou de outro mês não cobre", () => {
    const transactions = [tx({ amount: 300, kind: "GOAL", goalId: "itbi" })];
    const covered = (g: Goal) => spendingByDay(transactions, [g], OUTUBRO, HOJE).cash.beforeToday;

    expect(covered(goal({ amount: 300, status: "DONE" }))).toBe(reais(0));
    expect(covered(goal({ amount: 300, status: "CANCELLED" }))).toBe(reais(300));
    expect(covered(goal({ amount: 300, targetMonth: "2026-12" as YearMonth }))).toBe(reais(300));
  });
});

describe("moveMealCardOverflow", () => {
  const credit = reais(900);

  it("dentro do crédito, nada muda", () => {
    const raw = {
      cash: { beforeToday: reais(10), today: reais(0) },
      mealCard: { beforeToday: reais(800), today: reais(50) },
    };
    expect(moveMealCardOverflow(raw, credit)).toEqual(raw);
  });

  it("o que passa do crédito vira Dinheiro no dia em que estourou", () => {
    const result = moveMealCardOverflow(
      {
        cash: { beforeToday: reais(10), today: reais(0) },
        mealCard: { beforeToday: reais(880), today: reais(50) },
      },
      credit
    );
    expect(result.mealCard).toEqual({ beforeToday: reais(880), today: reais(20) });
    expect(result.cash).toEqual({ beforeToday: reais(10), today: reais(30) });
  });

  it("estouro antigo fica antes de hoje", () => {
    const result = moveMealCardOverflow(
      {
        cash: { beforeToday: reais(0), today: reais(0) },
        mealCard: { beforeToday: reais(950), today: reais(40) },
      },
      credit
    );
    expect(result.mealCard).toEqual({ beforeToday: reais(900), today: reais(0) });
    expect(result.cash).toEqual({ beforeToday: reais(50), today: reais(40) });
  });
});

describe("goalSpending", () => {
  it("meta do mês ainda não paga já sai inteira da sobra", () => {
    const result = goalSpending(
      [tx({ amount: 175, kind: "GOAL", goalId: "itbi" })],
      [goal({ amount: 18_886.2 })],
      OUTUBRO
    );

    expect(result.launched).toBe(reais(175));
    expect(result.committed).toBe(reais(18_886.2));
    expect(result.pending).toEqual([
      expect.objectContaining({ launched: reais(175), remaining: reais(18_711.2) }),
    ]);
  });

  it("pagar mais que o previsto conta o que foi pago", () => {
    const result = goalSpending(
      [tx({ amount: 20_000, kind: "GOAL", goalId: "itbi" })],
      [goal({ amount: 18_886.2 })],
      OUTUBRO
    );
    expect(result.committed).toBe(reais(20_000));
    expect(result.pending).toEqual([]);
  });

  it("concluída conta o que foi pago; sem lançamento, o previsto", () => {
    const paid = goalSpending(
      [tx({ amount: 15_000, kind: "GOAL", goalId: "itbi" })],
      [goal({ amount: 18_886.2, status: "DONE" })],
      OUTUBRO
    );
    expect(paid.committed).toBe(reais(15_000));
    expect(paid.pending).toEqual([]);

    const unlaunched = goalSpending([], [goal({ amount: 18_886.2, status: "DONE" })], OUTUBRO);
    expect(unlaunched.committed).toBe(reais(18_886.2));
  });

  it("lançamento de meta de outro mês sai inteiro; cancelada e de outro mês não comprometem", () => {
    const result = goalSpending(
      [tx({ amount: 500, kind: "GOAL", goalId: "mudanca" })],
      [
        goal({ id: "mudanca", amount: 3_425.89, targetMonth: "2026-11" as YearMonth }),
        goal({ id: "pousada", amount: 3_200, status: "CANCELLED" }),
      ],
      OUTUBRO
    );
    expect(result.committed).toBe(reais(500));
    expect(result.pending).toEqual([]);
  });
});
