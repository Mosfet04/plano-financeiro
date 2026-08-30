import { randomUUID } from "crypto";
import { formatInTimeZone } from "date-fns-tz";

import type { Clock, IdGenerator } from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import { CreatePlanUseCase } from "@/core/application/use-cases/create-plan.use-case";
import { GetProjectionUseCase } from "@/core/application/use-cases/get-projection.use-case";
import { RefreshMarketRatesUseCase } from "@/core/application/use-cases/refresh-market-rates.use-case";
import { TZ } from "@/infra/config/time";
import { getDb } from "@/infra/db/client";
import {
  DrizzleBudgetCategoryRepository,
  DrizzleGoalRepository,
  DrizzleRecurringItemRepository,
  DrizzleTransactionRepository,
} from "@/infra/db/repositories/budget.repository";
import {
  DrizzleFinancingRepository,
  DrizzleInvestmentRepository,
  DrizzleMarketRatesRepository,
} from "@/infra/db/repositories/finance.repository";
import { DrizzlePlanRepository } from "@/infra/db/repositories/plan.repository";
import { BcbSgsProvider } from "@/infra/market/bcb-sgs.provider";

const systemClock: Clock = {
  now: () => new Date(),
  today: () => formatInTimeZone(new Date(), TZ, "yyyy-MM-dd"),
};

const uuidGenerator: IdGenerator = { generate: () => randomUUID() };

/**
 * Raiz de composição: o único lugar que conhece os dois lados. Sem biblioteca
 * de DI — é um factory, e o cliente do Neon por trás já é memoizado.
 *
 * CRUD simples fala direto com `repos`; só o que tem regra vira caso de uso.
 */
export function buildContainer() {
  const db = getDb();

  const plans = new DrizzlePlanRepository(db);
  const recurringItems = new DrizzleRecurringItemRepository(db);
  const categories = new DrizzleBudgetCategoryRepository(db);
  const goals = new DrizzleGoalRepository(db);
  const transactions = new DrizzleTransactionRepository(db);
  const financings = new DrizzleFinancingRepository(db);
  const investments = new DrizzleInvestmentRepository(db);
  const marketRates = new DrizzleMarketRatesRepository(db);
  const ratesProvider = new BcbSgsProvider();

  return {
    db,
    clock: systemClock,
    ids: uuidGenerator,
    repos: {
      plans,
      recurringItems,
      categories,
      goals,
      transactions,
      financings,
      investments,
      marketRates,
    },
    useCases: {
      getProjection: new GetProjectionUseCase(plans, systemClock),
      createPlan: new CreatePlanUseCase(plans, uuidGenerator, systemClock),
      closeMonth: new CloseMonthUseCase(plans, transactions, systemClock),
      refreshMarketRates: new RefreshMarketRatesUseCase(
        marketRates,
        ratesProvider,
        plans,
        uuidGenerator,
        systemClock
      ),
    },
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
