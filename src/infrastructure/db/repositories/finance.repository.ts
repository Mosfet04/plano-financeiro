import { asc, desc, eq } from "drizzle-orm";

import type {
  FinancingRepository,
  InvestmentRepository,
  MarketRatesRepository,
  NewMarketRates,
} from "@/core/application/ports";
import type { ExtraAmortization, Financing } from "@/core/domain/financing/financing.entity";
import type { Investment } from "@/core/domain/investment/investment.entity";
import type { MarketRatesSnapshot } from "@/core/domain/market/market-rates.entity";

import type { Database } from "../client";
import { extraAmortizations, financings, investments, marketRates } from "../schema";
import { toExtraAmortization, toFinancing, toInvestment, toMarketRates } from "./mappers";

export class DrizzleFinancingRepository implements FinancingRepository {
  constructor(private readonly db: Database) {}

  async findByPlan(planId: string): Promise<Financing | null> {
    const row = await this.db.query.financings.findFirst({
      where: eq(financings.planId, planId),
    });
    return row ? toFinancing(row) : null;
  }

  async save(financing: Financing): Promise<void> {
    const values = {
      id: financing.id,
      planId: financing.planId,
      name: financing.name,
      principalCents: financing.principal,
      termMonths: financing.termMonths,
      annualInterest: financing.annualInterest,
      system: financing.system,
      insuranceMonthlyCents: financing.insuranceMonthly,
      firstInstallmentMonth: financing.firstInstallmentMonth,
      applyReferenceRate: financing.applyReferenceRate,
    };

    await this.db
      .insert(financings)
      .values(values)
      .onConflictDoUpdate({ target: financings.id, set: values });
  }

  async listExtraAmortizations(financingId: string): Promise<ExtraAmortization[]> {
    const rows = await this.db.query.extraAmortizations.findMany({
      where: eq(extraAmortizations.financingId, financingId),
      orderBy: asc(extraAmortizations.month),
    });
    return rows.map(toExtraAmortization);
  }

  async saveExtraAmortization(extra: ExtraAmortization): Promise<void> {
    await this.db
      .insert(extraAmortizations)
      .values({
        id: extra.id,
        financingId: extra.financingId,
        month: extra.month,
        amountCents: extra.amount,
      })
      .onConflictDoUpdate({
        target: [extraAmortizations.financingId, extraAmortizations.month],
        set: { amountCents: extra.amount },
      });
  }

  async deleteExtraAmortization(id: string): Promise<void> {
    await this.db.delete(extraAmortizations).where(eq(extraAmortizations.id, id));
  }
}

export class DrizzleInvestmentRepository implements InvestmentRepository {
  constructor(private readonly db: Database) {}

  async listByPlan(planId: string): Promise<Investment[]> {
    const rows = await this.db.query.investments.findMany({
      where: eq(investments.planId, planId),
      orderBy: asc(investments.maturityDate),
    });
    return rows.map(toInvestment);
  }

  async findById(id: string): Promise<Investment | null> {
    const row = await this.db.query.investments.findFirst({ where: eq(investments.id, id) });
    return row ? toInvestment(row) : null;
  }

  async save(investment: Investment): Promise<void> {
    const values = {
      id: investment.id,
      planId: investment.planId,
      name: investment.name,
      amountCents: investment.amount,
      maturityDate: investment.maturityDate,
      indexer: investment.indexer,
      indexerValue: investment.indexerValue,
      taxExempt: investment.taxExempt,
      instruction: investment.instruction,
    };

    await this.db
      .insert(investments)
      .values(values)
      .onConflictDoUpdate({ target: investments.id, set: values });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(investments).where(eq(investments.id, id));
  }
}

/** Append-only por decisão: o histórico de taxas é o registro da rotina semanal. */
export class DrizzleMarketRatesRepository implements MarketRatesRepository {
  constructor(private readonly db: Database) {}

  async latest(): Promise<MarketRatesSnapshot | null> {
    const row = await this.db.query.marketRates.findFirst({
      orderBy: desc(marketRates.capturedAt),
    });
    return row ? toMarketRates(row) : null;
  }

  async listRecent(limit: number): Promise<MarketRatesSnapshot[]> {
    const rows = await this.db.query.marketRates.findMany({
      orderBy: desc(marketRates.capturedAt),
      limit,
    });
    return rows.map(toMarketRates);
  }

  async create(id: string, rates: NewMarketRates): Promise<MarketRatesSnapshot> {
    const [row] = await this.db
      .insert(marketRates)
      .values({
        id,
        selicAnnual: rates.selicAnnual,
        cdiAnnual: rates.cdiAnnual,
        ipcaAnnual: rates.ipcaAnnual,
        referenceRateMonthly: rates.referenceRateMonthly,
        source: rates.source,
        notes: rates.notes,
        raw: rates.raw as Record<string, unknown>,
      })
      .returning();

    return toMarketRates(row);
  }
}
