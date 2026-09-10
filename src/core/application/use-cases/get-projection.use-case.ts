import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import {
  projectPlan,
  type ProjectionInput,
  type ProjectionSummary,
} from "@/core/domain/projection/project-plan";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";

import type { Clock, PlanRepository } from "../ports";

/** Sete anos de horizonte cobrem a quitação com folga e a tabela ainda cabe na tela. */
export const DEFAULT_HORIZON_MONTHS = 84;

export interface GetProjectionInput {
  readonly planId: string;
  readonly horizonMonths?: number;
  /** Sobrescreve premissas para simular sem gravar nada. */
  readonly overrides?: Partial<Pick<ProjectionInput, "goals" | "financing" | "yieldPolicy">>;
}

export interface GetProjectionOutput {
  readonly snapshot: PlanSnapshot;
  readonly projection: ProjectionSummary;
}

export function buildProjectionInput(
  snapshot: PlanSnapshot,
  asOfDate: string,
  horizonMonths: number
): ProjectionInput {
  return {
    startMonth: snapshot.plan.startMonth,
    horizonMonths,
    income: snapshot.income,
    recurringItems: snapshot.recurringItems,
    categories: snapshot.categories,
    goals: snapshot.goals,
    financing: snapshot.financing,
    extraAmortizations: snapshot.extraAmortizations,
    investments: snapshot.investments,
    cashAccounts: snapshot.cashAccounts,
    closings: snapshot.closings,
    fgts: snapshot.fgts,
    reserveTargets: snapshot.reserveTargets,
    yieldPolicy: snapshot.yieldPolicy,
    rates: snapshot.rates,
    options: { accrueInvestments: snapshot.accrueInvestments, asOfDate },
  };
}

export class GetProjectionUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly clock: Clock
  ) {}

  async execute(input: GetProjectionInput): Promise<Result<GetProjectionOutput>> {
    const snapshot = await this.plans.loadSnapshot(input.planId);
    if (!snapshot) {
      return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));
    }

    const base = buildProjectionInput(
      snapshot,
      this.clock.today(),
      input.horizonMonths ?? DEFAULT_HORIZON_MONTHS
    );

    return ok({
      snapshot,
      projection: projectPlan({ ...base, ...input.overrides }),
    });
  }
}
