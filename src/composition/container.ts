import { randomUUID } from "crypto";
import { formatInTimeZone } from "date-fns-tz";

import type { Clock, IdGenerator } from "@/core/application/ports";
import { CloseMonthUseCase } from "@/core/application/use-cases/close-month.use-case";
import { CreatePlanUseCase } from "@/core/application/use-cases/create-plan.use-case";
import { DevicePairingUseCase } from "@/core/application/use-cases/device-pairing.use-case";
import { GetProjectionUseCase } from "@/core/application/use-cases/get-projection.use-case";
import { SettleMonthUseCase } from "@/core/application/use-cases/settle-month.use-case";
import { RefreshMarketRatesUseCase } from "@/core/application/use-cases/refresh-market-rates.use-case";
import {
  GetWatchSnapshotUseCase,
  RecordWatchTransactionUseCase,
} from "@/core/application/use-cases/watch.use-case";
import { TZ } from "@/infra/config/time";
import { nodeSecretGenerator } from "@/infra/crypto/node-secret-generator";
import { getDb } from "@/infra/db/client";
import {
  DrizzleBudgetCategoryRepository,
  DrizzleGoalRepository,
  DrizzleRecurringItemRepository,
  DrizzleTransactionRepository,
} from "@/infra/db/repositories/budget.repository";
import {
  DrizzleDevicePairingRepository,
  DrizzleDeviceRepository,
} from "@/infra/db/repositories/device.repository";
import {
  DrizzleCashAccountRepository,
  DrizzleFgtsRepository,
  DrizzleFinancingRepository,
  DrizzleInvestmentRepository,
  DrizzleMarketRatesRepository,
} from "@/infra/db/repositories/finance.repository";
import {
  DrizzleMonthClosingRepository,
  DrizzlePlanRepository,
} from "@/infra/db/repositories/plan.repository";
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
  const cashAccounts = new DrizzleCashAccountRepository(db);
  const closings = new DrizzleMonthClosingRepository(db);
  const fgts = new DrizzleFgtsRepository(db);
  const marketRates = new DrizzleMarketRatesRepository(db);
  const devices = new DrizzleDeviceRepository(db);
  const devicePairings = new DrizzleDevicePairingRepository(db);
  const ratesProvider = new BcbSgsProvider();

  const closeMonth = new CloseMonthUseCase(plans, transactions, systemClock);
  const getProjection = new GetProjectionUseCase(plans, systemClock);

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
      cashAccounts,
      closings,
      fgts,
      marketRates,
      devices,
    },
    useCases: {
      getProjection,
      createPlan: new CreatePlanUseCase(plans, uuidGenerator, systemClock),
      closeMonth,
      settleMonth: new SettleMonthUseCase(plans, closeMonth, closings, uuidGenerator, systemClock),
      refreshMarketRates: new RefreshMarketRatesUseCase(
        marketRates,
        ratesProvider,
        plans,
        uuidGenerator,
        systemClock
      ),
      devicePairing: new DevicePairingUseCase(
        devicePairings,
        devices,
        nodeSecretGenerator,
        uuidGenerator,
        systemClock
      ),
      watchSnapshot: new GetWatchSnapshotUseCase(closeMonth, getProjection, systemClock),
      recordWatchTransaction: new RecordWatchTransactionUseCase(
        categories,
        transactions,
        uuidGenerator,
        systemClock
      ),
    },
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
