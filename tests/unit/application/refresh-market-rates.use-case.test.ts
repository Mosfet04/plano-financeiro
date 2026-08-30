import { describe, expect, it, vi } from "vitest";

import type {
  Clock,
  IdGenerator,
  MarketRatesProvider,
  MarketRatesRepository,
  NewMarketRates,
  PlanRepository,
} from "@/core/application/ports";
import { RefreshMarketRatesUseCase } from "@/core/application/use-cases/refresh-market-rates.use-case";
import type { MarketRatesSnapshot } from "@/core/domain/market/market-rates.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { buildSpreadsheetPlan } from "@/infra/db/seed-data";
import { ratesSnapshot } from "../../fixtures/plano-da-planilha";

function planSnapshot(rates: MarketRatesSnapshot | null, planId = "plan-1"): PlanSnapshot {
  let counter = 0;
  const seeded = buildSpreadsheetPlan({
    planId,
    userId: `user-de-${planId}`,
    nextId: () => `id-${++counter}`,
    // Ligado ao CDI: é o modo em que a rotina semanal muda a projeção.
    liveMode: true,
  });

  return {
    plan: { ...seeded.plan, name: `Plano de ${planId}` },
    income: seeded.income,
    yieldPolicy: seeded.yieldPolicy,
    accrueInvestments: seeded.accrueInvestments,
    recurringItems: seeded.recurringItems,
    categories: seeded.categories,
    goals: seeded.goals,
    financing: seeded.financing,
    extraAmortizations: [],
    investments: seeded.investments,
    reserveTargets: seeded.reserveTargets,
    rates,
  };
}

function build(options: {
  latest?: MarketRatesSnapshot | null;
  fetchImpl?: MarketRatesProvider["fetchCurrent"];
  plan?: PlanSnapshot | null;
  /** Planos que o `loadSnapshot` não acha — apagados no meio da rodada. */
  missing?: readonly string[];
}) {
  const created: NewMarketRates[] = [];

  const rates = {
    latest: vi.fn().mockResolvedValue(options.latest ?? null),
    listRecent: vi.fn().mockResolvedValue([]),
    create: vi.fn(async (id: string, value: NewMarketRates) => {
      created.push(value);
      return {
        id,
        capturedAt: new Date("2026-08-27T12:00:00Z"),
        selicAnnual: value.selicAnnual,
        cdiAnnual: value.cdiAnnual,
        ipcaAnnual: value.ipcaAnnual,
        referenceRateMonthly: value.referenceRateMonthly,
        source: value.source,
        notes: value.notes,
      } satisfies MarketRatesSnapshot;
    }),
  } as unknown as MarketRatesRepository;

  const provider = {
    fetchCurrent:
      options.fetchImpl ??
      vi.fn().mockResolvedValue({
        selicAnnual: 0.12,
        cdiAnnual: 0.119,
        ipcaAnnual: 0.04,
        referenceRateMonthly: 0.0012,
        raw: { fonte: "teste" },
      }),
  } as unknown as MarketRatesProvider;

  const plans = {
    // Chaveado por planId: a rotina reprojeta cada plano com o mesmo snapshot.
    loadSnapshot: vi.fn(async (planId: string) => {
      if (options.missing?.includes(planId)) return null;
      return options.plan === undefined
        ? planSnapshot(options.latest ?? null, planId)
        : options.plan;
    }),
  } as unknown as PlanRepository;

  const ids: IdGenerator = { generate: () => "snapshot-novo" };
  const clock: Clock = { now: () => new Date("2026-08-27T12:00:00Z"), today: () => "2026-08-27" };

  return {
    useCase: new RefreshMarketRatesUseCase(rates, provider, plans, ids, clock),
    provider,
    created,
  };
}

describe("RefreshMarketRatesUseCase", () => {
  it("sem corpo, busca no Banco Central e marca a fonte como BCB", async () => {
    const { useCase, provider, created } = build({});

    const result = await useCase.execute({ planIds: ["plan-1"] });

    expect(result.ok).toBe(true);
    expect(provider.fetchCurrent).toHaveBeenCalledOnce();
    expect(created[0].source).toBe("BCB");
    expect(created[0].cdiAnnual).toBeCloseTo(0.119, 10);
  });

  it("com as três taxas informadas, nem chama o Banco Central", async () => {
    const { useCase, provider, created } = build({});

    const result = await useCase.execute({
      planIds: ["plan-1"],
      manual: {
        selicAnnual: 0.1,
        cdiAnnual: 0.099,
        ipcaAnnual: 0.035,
        notes: "Copom de hoje.",
      },
    });

    expect(result.ok).toBe(true);
    expect(provider.fetchCurrent).not.toHaveBeenCalled();
    expect(created[0].source).toBe("AGENT");
    expect(created[0].notes).toBe("Copom de hoje.");
  });

  it("com taxa parcial, completa com o que veio do Banco Central", async () => {
    const { useCase, provider, created } = build({});

    await useCase.execute({ planIds: ["plan-1"], manual: { cdiAnnual: 0.08 } });

    expect(provider.fetchCurrent).toHaveBeenCalledOnce();
    expect(created[0].cdiAnnual).toBeCloseTo(0.08, 10);
    // Selic não foi informada: veio do BCB.
    expect(created[0].selicAnnual).toBeCloseTo(0.12, 10);
    expect(created[0].source).toBe("AGENT");
  });

  it("devolve erro de domínio quando o Banco Central falha", async () => {
    const { useCase } = build({
      fetchImpl: vi.fn().mockRejectedValue(new Error("SGS 432 respondeu 503")),
    });

    const result = await useCase.execute({ planIds: ["plan-1"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATES_FETCH_FAILED");
      expect(result.error.message).toContain("503");
    }
  });

  it("mede o impacto: CDI menor atrasa a quitação", async () => {
    const { useCase } = build({
      latest: ratesSnapshot,
      fetchImpl: vi.fn().mockResolvedValue({
        // Queda forte do CDI: 13,9% → 8%.
        selicAnnual: 0.08,
        cdiAnnual: 0.08,
        ipcaAnnual: 0.03,
        referenceRateMonthly: 0.001,
        raw: {},
      }),
    });

    const result = await useCase.execute({ planIds: ["plan-1"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.impacts).toHaveLength(1);
    const { impact } = result.value.impacts[0];
    expect(impact.netAnnualYieldAfter).toBeLessThan(impact.netAnnualYieldBefore);
    expect(impact.payoffMonthAfter! > impact.payoffMonthBefore!).toBe(true);
  });

  it("grava o snapshot mesmo sem plano para reprojetar", async () => {
    const { useCase, created } = build({ plan: null });

    const result = await useCase.execute({ planIds: [] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.impacts).toEqual([]);
    expect(created).toHaveLength(1);
  });

  it("um snapshot só, um impacto por plano", async () => {
    const { useCase, created } = build({ latest: ratesSnapshot });

    const result = await useCase.execute({ planIds: ["plan-1", "plan-2", "plan-3"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A taxa é a mesma para todo mundo: uma linha em `market_rates`, não três.
    expect(created).toHaveLength(1);

    expect(result.value.impacts).toHaveLength(3);
    expect(result.value.impacts.map((entry) => entry.planId)).toEqual([
      "plan-1",
      "plan-2",
      "plan-3",
    ]);
    // O nome vem junto para o relatório dizer de quem é cada quitação.
    expect(result.value.impacts[1].planName).toBe("Plano de plan-2");
  });

  it("pula o plano que sumiu no meio da rodada sem derrubar os outros", async () => {
    // Conta apagada entre o `listAll` da rota e o `loadSnapshot` daqui: o
    // impacto dela some do relatório, os outros dois continuam.
    const { useCase, created } = build({ latest: ratesSnapshot, missing: ["plan-2"] });

    const result = await useCase.execute({ planIds: ["plan-1", "plan-2", "plan-3"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.impacts.map((entry) => entry.planId)).toEqual(["plan-1", "plan-3"]);
    expect(created).toHaveLength(1);
  });
});
