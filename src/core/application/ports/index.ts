import type { BudgetCategory } from "@/core/domain/budget/budget-category.entity";
import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import type { MonthClosing } from "@/core/domain/closing/month-closing.entity";
import type { FgtsSettings } from "@/core/domain/fgts/fgts.entity";
import type { RecurringItem } from "@/core/domain/expense/recurring-item.entity";
import type { ExtraAmortization, Financing } from "@/core/domain/financing/financing.entity";
import type { Goal } from "@/core/domain/goal/goal.entity";
import type { Investment } from "@/core/domain/investment/investment.entity";
import type { MarketRatesSnapshot, RateSource } from "@/core/domain/market/market-rates.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import type {
  IncomeSettings,
  Plan,
  ReserveTarget,
  YieldPolicy,
} from "@/core/domain/plan/plan.entity";
import type { Transaction } from "@/core/domain/transaction/transaction.entity";
import type { YearMonth } from "@/core/domain/shared/month";

export interface Clock {
  now(): Date;
  /** Data civil de hoje no fuso do app, "YYYY-MM-DD". */
  today(): string;
}

export interface IdGenerator {
  generate(): string;
}

/** Tudo que nasce junto com um plano novo — ver `CreatePlanUseCase`. */
export interface NewPlanData {
  readonly plan: Plan;
  readonly income: IncomeSettings;
  readonly yieldPolicy: YieldPolicy;
  readonly categories: readonly BudgetCategory[];
  readonly reserveTargets: readonly ReserveTarget[];
}

export interface PlanRepository {
  findByUserId(userId: string): Promise<Plan | null>;
  /** Todos os planos do banco. Só a rotina de taxas usa — ela reprojeta cada um. */
  listAll(): Promise<Plan[]>;
  /**
   * Grava o plano e as linhas obrigatórias de uma vez. Se a corrida perder
   * para outra chamada, devolve o plano que já existe em vez de estourar.
   */
  create(data: NewPlanData): Promise<Plan>;
  /** Carrega o plano inteiro para projetar. */
  loadSnapshot(planId: string): Promise<PlanSnapshot | null>;
  saveIncomeSettings(settings: IncomeSettings): Promise<void>;
  saveYieldPolicy(policy: YieldPolicy, accrueInvestments: boolean): Promise<void>;
  saveReserveTarget(target: ReserveTarget): Promise<void>;
  deleteReserveTarget(id: string): Promise<void>;
}

export interface RecurringItemRepository {
  listByPlan(planId: string): Promise<RecurringItem[]>;
  findById(id: string): Promise<RecurringItem | null>;
  save(item: RecurringItem): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface BudgetCategoryRepository {
  listByPlan(planId: string): Promise<BudgetCategory[]>;
  findById(id: string): Promise<BudgetCategory | null>;
  save(category: BudgetCategory): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface GoalRepository {
  listByPlan(planId: string): Promise<Goal[]>;
  findById(id: string): Promise<Goal | null>;
  save(goal: Goal): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface FinancingRepository {
  findByPlan(planId: string): Promise<Financing | null>;
  save(financing: Financing): Promise<void>;
  listExtraAmortizations(financingId: string): Promise<ExtraAmortization[]>;
  saveExtraAmortization(extra: ExtraAmortization): Promise<void>;
  deleteExtraAmortization(id: string): Promise<void>;
}

export interface FgtsRepository {
  findByPlan(planId: string): Promise<FgtsSettings | null>;
  save(settings: FgtsSettings): Promise<void>;
}

export interface CashAccountRepository {
  listByPlan(planId: string): Promise<CashAccount[]>;
  findById(id: string): Promise<CashAccount | null>;
  save(account: CashAccount): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface MonthClosingRepository {
  listByPlan(planId: string): Promise<MonthClosing[]>;
  findByMonth(planId: string, month: YearMonth): Promise<MonthClosing | null>;
  save(closing: MonthClosing): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface InvestmentRepository {
  listByPlan(planId: string): Promise<Investment[]>;
  findById(id: string): Promise<Investment | null>;
  save(investment: Investment): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TransactionRepository {
  listByMonth(planId: string, month: YearMonth): Promise<Transaction[]>;
  findById(id: string): Promise<Transaction | null>;
  save(transaction: Transaction): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface NewMarketRates {
  readonly selicAnnual: number;
  readonly cdiAnnual: number;
  readonly ipcaAnnual: number;
  readonly referenceRateMonthly: number | null;
  readonly source: RateSource;
  readonly notes: string | null;
  readonly raw: unknown;
}

export interface MarketRatesRepository {
  latest(): Promise<MarketRatesSnapshot | null>;
  create(id: string, rates: NewMarketRates): Promise<MarketRatesSnapshot>;
  listRecent(limit: number): Promise<MarketRatesSnapshot[]>;
}

/** Fonte externa de taxas — hoje o SGS do Banco Central. */
export interface MarketRatesProvider {
  fetchCurrent(): Promise<{
    selicAnnual: number;
    cdiAnnual: number;
    ipcaAnnual: number;
    referenceRateMonthly: number | null;
    raw: unknown;
  }>;
}
