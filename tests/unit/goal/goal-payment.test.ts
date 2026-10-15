import { describe, expect, it } from "vitest";

import { goalMovedByPayment, resolvePendingGoal, type Goal } from "@/core/domain/goal/goal.entity";
import { reais } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";

const OUTUBRO = "2026-10" as YearMonth;
const NOVEMBRO = "2026-11" as YearMonth;

const mudanca: Goal = {
  id: "mudanca",
  planId: "plan-1",
  name: "Mudança",
  amount: reais(3_425.89),
  targetMonth: NOVEMBRO,
  fundingSource: null,
  note: null,
  status: "PLANNED",
  sortOrder: 1,
};

describe("goalMovedByPayment", () => {
  it("meta paga antes do mês dela vai para o mês do pagamento", () => {
    expect(goalMovedByPayment(mudanca, OUTUBRO, false)).toEqual({
      ...mudanca,
      targetMonth: OUTUBRO,
    });
  });

  it("meta sem data ganha o mês do pagamento", () => {
    expect(goalMovedByPayment({ ...mudanca, targetMonth: null }, OUTUBRO, false)?.targetMonth).toBe(
      OUTUBRO
    );
  });

  it("não mexe no mês dela, em parcela já paga no mês dela, nem em meta fechada", () => {
    expect(goalMovedByPayment(mudanca, NOVEMBRO, false)).toBeNull();
    expect(goalMovedByPayment(mudanca, OUTUBRO, true)).toBeNull();
    expect(goalMovedByPayment({ ...mudanca, status: "DONE" }, OUTUBRO, false)).toBeNull();
    expect(goalMovedByPayment({ ...mudanca, status: "CANCELLED" }, OUTUBRO, false)).toBeNull();
  });
});

describe("resolvePendingGoal", () => {
  const itbi: Goal = {
    ...mudanca,
    id: "itbi",
    name: "ITBI",
    amount: reais(18_886.2),
    targetMonth: OUTUBRO,
  };

  it("concluída fecha a meta com o valor previsto", () => {
    const pending = { goal: itbi, launched: reais(15_670.14), remaining: reais(3_216.06) };
    expect(resolvePendingGoal(pending, "DONE", NOVEMBRO, "novo")).toEqual([
      { ...itbi, status: "DONE" },
    ]);
  });

  it("restante sem nada pago move a meta inteira", () => {
    const pending = { goal: itbi, launched: reais(0), remaining: itbi.amount };
    expect(resolvePendingGoal(pending, "CARRY", NOVEMBRO, "novo")).toEqual([
      { ...itbi, targetMonth: NOVEMBRO },
    ]);
  });

  it("restante com parte paga divide: o pago fica concluído, o resto vira meta do mês seguinte", () => {
    const pending = { goal: itbi, launched: reais(15_670.14), remaining: reais(3_216.06) };
    const [paid, rest] = resolvePendingGoal(pending, "CARRY", NOVEMBRO, "novo");

    expect(paid).toEqual({ ...itbi, amount: reais(15_670.14), status: "DONE" });
    expect(rest).toEqual({
      ...itbi,
      id: "novo",
      name: "ITBI (restante)",
      amount: reais(3_216.06),
      targetMonth: NOVEMBRO,
      status: "PLANNED",
    });
  });
});
