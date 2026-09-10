import { RateSource, type MarketRatesSnapshot } from "@/core/domain/market/market-rates.entity";
import type { ProjectionInput } from "@/core/domain/projection/project-plan";
import { buildSpreadsheetPlan } from "@/infra/db/seed-data";

export { MOVE_MONTH, START_MONTH } from "@/infra/db/seed-data";

/** Copom de 05/08/2026 — as taxas anotadas na aba "5. Números". */
export const ratesSnapshot: MarketRatesSnapshot = {
  id: "rates-1",
  capturedAt: new Date("2026-08-24T12:00:00Z"),
  selicAnnual: 0.14,
  cdiAnnual: 0.139,
  ipcaAnnual: 0.045,
  referenceRateMonthly: 0.001709,
  source: RateSource.MANUAL,
  notes: "Premissas da planilha de agosto/2026.",
};

/** Ids estáveis: o mesmo plano gera sempre os mesmos identificadores no teste. */
function sequentialIds() {
  let counter = 0;
  return () => `seed-${++counter}`;
}

export function spreadsheetPlan() {
  return buildSpreadsheetPlan({
    planId: "plan-planilha",
    userId: "user-1",
    nextId: sequentialIds(),
    // Modo planilha: valor de face nas aplicações e 11% líquidos fixos.
    liveMode: false,
  });
}

/**
 * Entrada que reproduz a planilha linha por linha, para o teste-ouro comparar
 * contra `planilha-projecao.json`.
 */
export function spreadsheetProjectionInput(): ProjectionInput {
  const seeded = spreadsheetPlan();

  return {
    startMonth: seeded.plan.startMonth,
    horizonMonths: 84,
    income: seeded.income,
    recurringItems: seeded.recurringItems,
    categories: seeded.categories,
    goals: seeded.goals,
    financing: seeded.financing,
    extraAmortizations: [],
    investments: seeded.investments,
    // Vazio de propósito: a planilha não tem caixa de abertura, e sem contas
    // cadastradas a reserva não rende — que é como ela calcula.
    cashAccounts: [],
    closings: [],
    reserveTargets: seeded.reserveTargets,
    yieldPolicy: seeded.yieldPolicy,
    rates: ratesSnapshot,
    options: { accrueInvestments: seeded.accrueInvestments, asOfDate: "2026-08-24" },
  };
}
