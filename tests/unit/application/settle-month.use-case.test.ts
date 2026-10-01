import { describe, expect, it, vi } from "vitest";

import type {
  Clock,
  IdGenerator,
  MonthClosingRepository,
  MonthTurnover,
  PlanRepository,
  TransactionRepository,
} from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import {
  SettleMonthUseCase,
  type ConferredBalance,
} from "@/core/application/use-cases/settle-month.use-case";
import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import type { MonthClosing } from "@/core/domain/closing/month-closing.entity";
import type { FgtsSettings } from "@/core/domain/fgts/fgts.entity";
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
    checkedOn: "2026-08-10",
  },
  {
    id: "pp",
    planId: "plan-1",
    name: "Cofrinho PicPay",
    balance: reais(2500),
    indexer: Indexer.CDI_PCT,
    indexerValue: 1.02,
    taxExempt: false,
    checkedOn: "2026-08-10",
  },
];

/** Os dois saldos conferidos na virada: R$ 3.000 guardados na Nubank. */
const conferidos: ConferredBalance[] = [
  { accountId: "nu", balance: reais(9000) },
  { accountId: "pp", balance: reais(2520) },
];

const fgtsLigado: FgtsSettings = {
  planId: "plan-1",
  enabled: true,
  balance: reais(18_000),
  depositRate: 0.08,
  annualYield: 0.03,
  withdrawalEveryMonths: 24,
  firstWithdrawalMonth: monthOf(2027, 12),
};

function build({
  existing = null,
  cashAccounts = contas,
  today = "2026-09-01",
  fgts = null,
}: {
  existing?: MonthClosing | null;
  cashAccounts?: CashAccount[];
  today?: string;
  fgts?: FgtsSettings | null;
} = {}) {
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
    fgts,
    reserveTargets: seeded.reserveTargets,
    rates: ratesSnapshot,
  };

  const plans = { loadSnapshot: vi.fn().mockResolvedValue(snapshot) } as unknown as PlanRepository;
  const transactions = {
    listByMonth: vi.fn().mockResolvedValue([]),
  } as unknown as TransactionRepository;

  const settle = vi.fn().mockResolvedValue(undefined);
  const closings = { settle } as unknown as MonthClosingRepository;

  const clock: Clock = { now: () => new Date(`${today}T12:00:00Z`), today: () => today };
  const ids: IdGenerator = { generate: () => "novo-id" };

  const useCase = new SettleMonthUseCase(
    plans,
    new CloseMonthUseCase(plans, transactions, clock),
    closings,
    ids,
    clock
  );

  return { useCase, settle, seeded };
}

const written = (settle: ReturnType<typeof vi.fn>) => settle.mock.calls[0][0] as MonthTurnover;

describe("SettleMonthUseCase — a virada", () => {
  it("grava fechamento e saldos numa chamada só", async () => {
    const { useCase, settle } = build();
    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO, balances: conferidos });

    expect(result.ok).toBe(true);
    expect(settle).toHaveBeenCalledOnce();

    const turnover = written(settle);
    expect(turnover.closing.month).toBe(AGOSTO);
    expect(turnover.closing.planId).toBe("plan-1");
    expect(turnover.closing.leftover).toBeGreaterThan(0);
    expect(turnover.closing.planTarget).toBeGreaterThan(0);
  });

  /** A data vale para o caixa inteiro: todas as contas saem conferidas hoje. */
  it("todas as contas ficam com o saldo novo e a data de hoje", async () => {
    const { useCase, settle } = build();
    await useCase.execute({ planId: "plan-1", month: AGOSTO, balances: conferidos });

    const { accounts } = written(settle);
    expect(accounts.map((a) => [a.id, a.balance, a.checkedOn])).toEqual([
      ["nu", reais(9000), "2026-09-01"],
      ["pp", reais(2520), "2026-09-01"],
    ]);
    // O resto da conta não muda: só saldo e data.
    expect(accounts[1].indexerValue).toBe(1.02);
  });

  it("congela o caixa somado dos saldos conferidos, não dos antigos", async () => {
    const { useCase, settle } = build();
    await useCase.execute({ planId: "plan-1", month: AGOSTO, balances: conferidos });

    expect(written(settle).closing.cash).toBe(reais(11_520));
  });

  it("refazer a virada reaproveita o id em vez de duplicar", async () => {
    const existing: MonthClosing = {
      id: "id-antigo",
      planId: "plan-1",
      month: AGOSTO,
      leftover: reais(1),
      planTarget: reais(1),
      cash: reais(1),
      closedAt: new Date("2026-08-31T12:00:00Z"),
      note: null,
    };

    const { useCase, settle } = build({ existing });
    await useCase.execute({ planId: "plan-1", month: AGOSTO, balances: conferidos });

    expect(written(settle).closing.id).toBe("id-antigo");
    expect(written(settle).closing.leftover).not.toBe(reais(1));
  });

  it("guarda a nota quando ela vem", async () => {
    const { useCase, settle } = build();
    await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: conferidos,
      note: "R$ 700 ficaram na conta corrente",
    });

    expect(written(settle).closing.note).toBe("R$ 700 ficaram na conta corrente");
  });
});

describe("quando a virada pode acontecer", () => {
  it("recusa um mês que ainda não começou", async () => {
    const { useCase, settle } = build();
    const result = await useCase.execute({
      planId: "plan-1",
      month: monthOf(2026, 10),
      balances: conferidos,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MONTH_IN_FUTURE");
    expect(settle).not.toHaveBeenCalled();
  });

  /**
   * Era o botão que fechava o mês errado: no dia 1º o /mes abre no mês novo, e
   * fechá-lo tirava da projeção a sobra inteira dele.
   */
  it("recusa o mês corrente antes do último dia", async () => {
    const { useCase, settle } = build({ today: "2026-09-01" });
    const result = await useCase.execute({
      planId: "plan-1",
      month: SETEMBRO,
      balances: conferidos,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MONTH_NOT_OVER");
    expect(settle).not.toHaveBeenCalled();
  });

  it("no último dia do mês a virada abre", async () => {
    const { useCase, settle } = build({ today: "2026-08-31" });
    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO, balances: conferidos });

    expect(result.ok).toBe(true);
    expect(written(settle).accounts[0].checkedOn).toBe("2026-08-31");
  });

  /** Sem conta, o caixa da projeção vira zero e todo o dinheiro guardado some. */
  it("sem contas cadastradas não fecha", async () => {
    const { useCase, settle } = build({ cashAccounts: [] });
    const result = await useCase.execute({ planId: "plan-1", month: AGOSTO, balances: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_CASH_ACCOUNTS");
    expect(settle).not.toHaveBeenCalled();
  });
});

describe("conferência dos saldos", () => {
  it("exige o saldo de todas as contas, e diz qual faltou", async () => {
    const { useCase, settle } = build();
    const result = await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: [conferidos[0]],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_BALANCE");
      expect(result.error.message).toContain("Cofrinho PicPay");
    }
    expect(settle).not.toHaveBeenCalled();
  });

  /** O id vem do cliente: conta de outro plano não pode atravessar. */
  it("recusa conta que não é do plano", async () => {
    const { useCase } = build();
    const result = await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: [...conferidos, { accountId: "de-outra-pessoa", balance: reais(1) }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN_ACCOUNT");
  });

  it("recusa a mesma conta duas vezes", async () => {
    const { useCase } = build();
    const result = await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: [...conferidos, conferidos[0]],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUPLICATE_BALANCE");
  });

  it("recusa saldo negativo", async () => {
    const { useCase } = build();
    const result = await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: [conferidos[0], { accountId: "pp", balance: reais(-1) }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_BALANCE");
  });
});

describe("aplicações vencidas e FGTS", () => {
  // A LCI do BRB vence em 08/09/2026; o CDB Digimais, em 09/11/2026.
  const lci = (seeded: ReturnType<typeof build>["seeded"]) =>
    seeded.investments.find((inv) => inv.maturityDate === "2026-09-08")!;
  const digimais = (seeded: ReturnType<typeof build>["seeded"]) =>
    seeded.investments.find((inv) => inv.maturityDate === "2026-11-09")!;

  it("aplicação vencida que caiu na caixinha sai da lista junto", async () => {
    const { useCase, settle, seeded } = build({ today: "2026-10-01" });
    const result = await useCase.execute({
      planId: "plan-1",
      month: SETEMBRO,
      balances: conferidos,
      redeemedInvestmentIds: [lci(seeded).id],
    });

    expect(result.ok).toBe(true);
    expect(written(settle).redeemedInvestmentIds).toEqual([lci(seeded).id]);
  });

  it("recusa resgatar aplicação que ainda não venceu", async () => {
    const { useCase, settle, seeded } = build({ today: "2026-10-01" });
    const result = await useCase.execute({
      planId: "plan-1",
      month: SETEMBRO,
      balances: conferidos,
      redeemedInvestmentIds: [digimais(seeded).id],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVESTMENT_NOT_MATURED");
    expect(settle).not.toHaveBeenCalled();
  });

  it("com FGTS ligado, o saldo conferido vai junto", async () => {
    const { useCase, settle } = build({ fgts: fgtsLigado });
    await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: conferidos,
      fgtsBalance: reais(18_680),
    });

    expect(written(settle).fgtsBalance).toBe(reais(18_680));
  });

  it("com FGTS desligado, o saldo informado é ignorado", async () => {
    const { useCase, settle } = build({ fgts: { ...fgtsLigado, enabled: false } });
    await useCase.execute({
      planId: "plan-1",
      month: AGOSTO,
      balances: conferidos,
      fgtsBalance: reais(18_680),
    });

    expect(written(settle).fgtsBalance).toBeNull();
  });
});

describe("revisão da virada", () => {
  it("o esperado de cada conta é o saldo anterior mais o rendimento", async () => {
    const { useCase } = build({ today: "2026-09-01" });
    const result = await useCase.review({ planId: "plan-1", month: AGOSTO });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [nubank] = result.value.accounts;
    expect(nubank.estimatedYield).toBeGreaterThan(0);
    expect(nubank.expected).toBe(nubank.account.balance + nubank.estimatedYield);
    expect(result.value.checkedOn).toBe("2026-09-01");
  });

  it("lista só as aplicações que já venceram", async () => {
    const { useCase } = build({ today: "2026-10-01" });
    const result = await useCase.review({ planId: "plan-1", month: SETEMBRO });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maturedInvestments.map((inv) => inv.maturityDate)).toEqual([
        "2026-09-08",
      ]);
    }
  });

  it("recusa revisar um mês que não terminou", async () => {
    const { useCase } = build({ today: "2026-09-15" });
    const result = await useCase.review({ planId: "plan-1", month: SETEMBRO });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MONTH_NOT_OVER");
  });
});

describe("prévia da virada", () => {
  it("mostra o plano antes e depois sem gravar nada", async () => {
    const { useCase, settle } = build();
    const result = await useCase.preview({ planId: "plan-1", month: AGOSTO, balances: conferidos });

    expect(result.ok).toBe(true);
    expect(settle).not.toHaveBeenCalled();
    if (!result.ok) return;

    // Antes: saldo conferido em 10/08, a projeção começa em agosto.
    // Depois: agosto fechado, ela começa em setembro com o caixa novo.
    expect(result.value.before.startMonth).toBe(AGOSTO);
    expect(result.value.after.startMonth).toBe(SETEMBRO);
    expect(result.value.before.openingCash).toBe(reais(8500));
    expect(result.value.after.openingCash).toBe(reais(11_520));
  });

  it("a prévia recusa o que a virada recusaria", async () => {
    const { useCase } = build();
    const result = await useCase.preview({
      planId: "plan-1",
      month: AGOSTO,
      balances: [conferidos[0]],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_BALANCE");
  });
});
