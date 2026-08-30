import type { MarketRatesSnapshot } from "@/core/domain/market/market-rates.entity";
import { RateSource } from "@/core/domain/market/market-rates.entity";
import type { AmortizationVerdict } from "@/core/domain/projection/amortization-advice";
import { projectPlan } from "@/core/domain/projection/project-plan";
import type { Cents } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";

import type {
  Clock,
  IdGenerator,
  MarketRatesProvider,
  MarketRatesRepository,
  PlanRepository,
} from "../ports";
import { buildProjectionInput, DEFAULT_HORIZON_MONTHS } from "./get-projection.use-case";

/** Taxas informadas pelo agente. Cada campo ausente cai para o valor do BCB. */
export interface ManualRates {
  readonly selicAnnual?: number;
  readonly cdiAnnual?: number;
  readonly ipcaAnnual?: number;
  readonly referenceRateMonthly?: number | null;
  readonly notes?: string;
}

export interface RefreshMarketRatesInput {
  /**
   * Planos a reprojetar. O snapshot de taxas é UM só e vale para todo mundo —
   * a tabela `market_rates` não tem `planId` de propósito. O que é por pessoa
   * é o impacto: o mesmo CDI muda a quitação de cada plano de um jeito.
   */
  readonly planIds: readonly string[];
  /** Quando presente, os valores informados vencem os do BCB. */
  readonly manual?: ManualRates;
}

export interface ProjectionImpact {
  readonly payoffMonthBefore: YearMonth | null;
  readonly payoffMonthAfter: YearMonth | null;
  readonly minCashBefore: Cents;
  readonly minCashAfter: Cents;
  readonly netAnnualYieldBefore: number;
  readonly netAnnualYieldAfter: number;
  /**
   * Veredito sobre amortizar antes e depois do snapshot. A virada é o evento
   * que a rotina semanal existe para pegar.
   */
  readonly amortizationBefore: AmortizationVerdict | null;
  readonly amortizationAfter: AmortizationVerdict | null;
  readonly amortizationFlipped: boolean;
}

/** O impacto do snapshot num plano, com o nome para o relatório da rotina. */
export interface PlanImpact {
  readonly planId: string;
  readonly planName: string;
  readonly impact: ProjectionImpact;
}

export interface RefreshMarketRatesOutput {
  readonly snapshot: MarketRatesSnapshot;
  readonly previous: MarketRatesSnapshot | null;
  /** Vazio quando não há plano para reprojetar. */
  readonly impacts: readonly PlanImpact[];
}

/**
 * Grava um snapshot novo de taxas e devolve o que isso fez com cada plano.
 *
 * O diff é o ponto: a rotina de quinta não precisa reportar "ok", e sim
 * "a quitação do Mateus passou de set/2030 para out/2030".
 */
export class RefreshMarketRatesUseCase {
  constructor(
    private readonly rates: MarketRatesRepository,
    private readonly provider: MarketRatesProvider,
    private readonly plans: PlanRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async execute(input: RefreshMarketRatesInput): Promise<Result<RefreshMarketRatesOutput>> {
    const previous = await this.rates.latest();

    const fetched = await this.fetchRates(input.manual, previous);
    if (!fetched.ok) return fetched;

    const snapshot = await this.rates.create(this.ids.generate(), fetched.value);

    const measured = await Promise.all(
      input.planIds.map((planId) => this.measureImpact(planId, previous, snapshot))
    );

    return ok({
      snapshot,
      previous,
      impacts: measured.filter((entry): entry is PlanImpact => entry !== null),
    });
  }

  private async fetchRates(manual: ManualRates | undefined, previous: MarketRatesSnapshot | null) {
    const manualIsComplete =
      manual?.selicAnnual !== undefined &&
      manual?.cdiAnnual !== undefined &&
      manual?.ipcaAnnual !== undefined;

    // Com as três taxas informadas não vale bater no BCB: o agente já tem tudo.
    if (manualIsComplete) {
      return ok({
        selicAnnual: manual.selicAnnual!,
        cdiAnnual: manual.cdiAnnual!,
        ipcaAnnual: manual.ipcaAnnual!,
        referenceRateMonthly: manual.referenceRateMonthly ?? previous?.referenceRateMonthly ?? null,
        source: RateSource.AGENT,
        notes: manual.notes ?? null,
        raw: { manual },
      });
    }

    try {
      const fetched = await this.provider.fetchCurrent();
      return ok({
        selicAnnual: manual?.selicAnnual ?? fetched.selicAnnual,
        cdiAnnual: manual?.cdiAnnual ?? fetched.cdiAnnual,
        ipcaAnnual: manual?.ipcaAnnual ?? fetched.ipcaAnnual,
        referenceRateMonthly: manual?.referenceRateMonthly ?? fetched.referenceRateMonthly ?? null,
        source: manual ? RateSource.AGENT : RateSource.BCB,
        notes: manual?.notes ?? null,
        raw: fetched.raw,
      });
    } catch (cause) {
      return err(
        new DomainError(
          "RATES_FETCH_FAILED",
          `Não consegui buscar as taxas no Banco Central: ${
            cause instanceof Error ? cause.message : String(cause)
          }`
        )
      );
    }
  }

  private async measureImpact(
    planId: string,
    previous: MarketRatesSnapshot | null,
    current: MarketRatesSnapshot
  ): Promise<PlanImpact | null> {
    const plan = await this.plans.loadSnapshot(planId);
    if (!plan) return null;

    const today = this.clock.today();
    const before = projectPlan(
      buildProjectionInput({ ...plan, rates: previous }, today, DEFAULT_HORIZON_MONTHS)
    );
    const after = projectPlan(
      buildProjectionInput({ ...plan, rates: current }, today, DEFAULT_HORIZON_MONTHS)
    );

    const amortizationBefore = before.amortizationAdvice?.verdict ?? null;
    const amortizationAfter = after.amortizationAdvice?.verdict ?? null;

    const impact: ProjectionImpact = {
      payoffMonthBefore: before.payoffMonth,
      payoffMonthAfter: after.payoffMonth,
      minCashBefore: before.minCash,
      minCashAfter: after.minCash,
      netAnnualYieldBefore: before.netAnnualYield,
      netAnnualYieldAfter: after.netAnnualYield,
      amortizationBefore,
      amortizationAfter,
      amortizationFlipped:
        amortizationBefore !== null &&
        amortizationAfter !== null &&
        amortizationBefore !== amortizationAfter,
    };

    return { planId, planName: plan.plan.name, impact };
  }
}
