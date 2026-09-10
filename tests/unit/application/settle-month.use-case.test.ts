import { describe, expect, it, vi } from "vitest";

import type {
  Clock,
  IdGenerator,
  MonthClosingRepository,
  PlanRepository,
  TransactionRepository,
} from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import { SettleMonthUseCase } from "@/core/application/use-cases/settle-month.use-case";
import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import type { MonthClosing } from "@/core/domain/closing/month-closing.entity";
import { Indexer } from "@/core/domain/investment/investment.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { reais } from "@/core/domain/shared/money";
import { monthOf } from "@/core/domain/shared/month";
import { buildSpreadsheetPlan } from "@/infra/db/seed-data";
import { ratesSnapshot } from "../../fixtures/plano-da-planilha";

const AGOSTO = monthOf(2026, 8);
const SETEMBRO = monthOf(2026, 9);

const contas: CashAccount[] = [
  {
    id: "nu",
    planId: "plan-1",
    name: "Caixinha Nubank",
    balance: reais(6000),
    indexer: Indexer.CDI_PCT,
    indexerValue: 1,
    taxExempt: false,
    checkedOn: "2026-08-27",
  },
  {
    id: "pp",
    planId: "plan-1",
    name: "Cofrinho PicPay",
    balance: reais(2500),
    indexer: Indexer.CDI_PCT,
    indexerValue: 1.02,
    taxExempt: false,
    checkedOn: "2026-08-27",
  },
];

function build({
  existing = null,
  cashAccounts = contas,
}: { existing?: MonthClosing | null; cashAccounts?: CashAccount[] } = {}) {
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
    cashAccounts,
    closings: existing ? [existing] : [],
    reserveTargets: seeded.reserveTargets,
    rates: ratesSnapshot,
  };

  const plans = { loadSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as PlanRepository;
  const transactions = {
    listByMonth: vi.fn().mockResolvedValue([]),
  } as unknown as TransactionRepository;

  const save = vi.fn().mockResolvedValue(undefined);
  const closings = {
    findByMonth: vi.fn().mockResolvedValue(existing),
    save,
  } as unknown as MonthClosingRepository;

  const clock: Clock = { now: () => new Date("2026-08-27T12:00:00Z"), today: () => "2026-08-27" };
  const ids: IdGenerator = { generate: () => "novo-id" };

  const useCase = new SettleMonthUseCase(
    plans,
    new CloseMonthUseCase(plans, transactions, clock),
    closings,
    ids,
    clock
  );

  return { useCase, save };
}

describe("SettleMonthUseCase", () => {
  it("grava a sobra realizada e a meta do plano", async () => {
    const { useCase, save } = build();
    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledOnce();

    const written = save.mock.calls[0][0] as MonthClosing;
    expect(written.month).toBe(AGOSTO);
    expect(written.planId).toBe("plan-1");
    expect(written.leftover).toBeGreaterThan(0);
    expect(written.planTarget).toBeGreaterThan(0);
  });

  it("congela o caixa somado das contas", async () => {
    const { useCase, save } = build();
    await useCase.execute({ planId: "plan-1", month: AGOSTO });

    const written = save.mock.calls[0][0] as MonthClosing;
    expect(written.cash).toBe(reais(8500));
  });

  it("sem contas cadastradas o caixa congelado é zero", async () => {
    const { useCase, save } = build({ cashAccounts: [] });
    await useCase.execute({ planId: "plan-1", month: AGOSTO });

    const written = save.mock.calls[0][0] as MonthClosing;
    expect(written.cash).toBe(0);
  });

  it("refechar o mesmo mês reaproveita o id em vez de duplicar", async () => {
    const existing: MonthClosing = {
      id: "id-antigo",
      planId: "plan-1",
      month: AGOSTO,
      leftover: reais(1),
      planTarget: reais(1),
      cash: reais(1),
      closedAt: new Date("2026-08-20T12:00:00Z"),
      note: null,
    };

    const { useCase, save } = build({ existing });
    await useCase.execute({ planId: "plan-1", month: AGOSTO });

    const written = save.mock.calls[0][0] as MonthClosing;
    expect(written.id).toBe("id-antigo");
    expect(written.leftover).not.toBe(reais(1));
  });

  it("guarda a nota quando ela vem", async () => {
    const { useCase, save } = build();
    await useCase.execute({ planId: "plan-1", month: AGOSTO, note: "  PLR entrou  " });

    const written = save.mock.calls[0][0] as MonthClosing;
    expect(written.note).toBe("  PLR entrou  ");
  });

  /**
   * Fechar mês que ainda não começou congelaria um número que ainda vai mudar —
   * e pior, tiraria da projeção uma sobra que ainda está inteira por vir.
   */
  it("recusa fechar um mês que ainda não começou", async () => {
    const { useCase, save } = build();
    const result = await useCase.execute({ planId: "plan-1", month: SETEMBRO });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MONTH_IN_FUTURE");
    expect(save).not.toHaveBeenCalled();
  });

  it("o mês corrente pode ser fechado", async () => {
    const { useCase, save } = build();
    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });
});
