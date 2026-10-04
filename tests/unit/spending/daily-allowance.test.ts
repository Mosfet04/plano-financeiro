import { describe, expect, it } from "vitest";

import { reais, type Cents } from "@/core/domain/shared/money";
import { dailyAllowance } from "@/core/domain/spending/daily-allowance";

function allowance(today: string, budget: number, before = 0, todaySpent = 0) {
  return dailyAllowance({
    monthBudget: reais(budget),
    spentBeforeToday: reais(before),
    spentToday: reais(todaySpent),
    today,
  });
}

describe("dailyAllowance", () => {
  it("dia 1: o mês inteiro dividido pelos dias, nada gasto antes", () => {
    const result = allowance("2026-10-01", 930);
    expect(result.daysLeft).toBe(31);
    expect(result.dayBudget).toBe(reais(30));
    expect(result.remainingToday).toBe(reais(30));
    expect(result.monthRemaining).toBe(reais(930));
  });

  it("último dia: o que sobrou do mês é o dia inteiro", () => {
    const result = allowance("2026-10-31", 930, 900);
    expect(result.daysLeft).toBe(1);
    expect(result.dayBudget).toBe(reais(30));
  });

  it("gasto de hoje sai inteiro do dia, não é rateado", () => {
    const result = allowance("2026-10-21", 930, 500, 50);
    // (930 − 500) ÷ 11 = 39,0909… → 39,09
    expect(result.dayBudget).toBe(reais(39.09));
    expect(result.remainingToday).toBe(reais(-10.91));
    expect(result.monthRemaining).toBe(reais(380));
  });

  it("mês estourado divide o buraco pelos dias que faltam", () => {
    const result = allowance("2026-10-22", 900, 1000);
    // −100 ÷ 10
    expect(result.dayBudget).toBe(reais(-10));
    expect(result.remainingToday).toBe(reais(-10));
  });

  it("orçamento zero não divide por nada estranho", () => {
    const result = allowance("2026-10-15", 0);
    expect(result.dayBudget).toBe(0 as Cents);
    expect(result.remainingToday).toBe(0 as Cents);
  });

  it("arredonda para baixo, também no negativo", () => {
    expect(allowance("2026-10-01", 10).dayBudget).toBe(reais(0.32)); // 32,25… centavos
    expect(allowance("2026-10-01", -10).dayBudget).toBe(reais(-0.33));
  });

  it.each([
    ["2026-02-01", 28],
    ["2028-02-01", 29],
    ["2026-11-01", 30],
    ["2026-12-01", 31],
  ])("%s tem %i dias pela frente", (today, days) => {
    expect(allowance(today, 100).daysLeft).toBe(days);
  });
});
