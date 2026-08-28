import type { BudgetCategory } from "../budget/budget-category.entity";
import { ItemDirection, ItemGroup, type RecurringItem } from "../expense/recurring-item.entity";
import {
  AmortizationSystem,
  type ExtraAmortization,
  type Financing,
} from "../financing/financing.entity";
import { GoalStatus, type Goal } from "../goal/goal.entity";
import type { Investment } from "../investment/investment.entity";
import type { MarketRatesSnapshot } from "../market/market-rates.entity";
import type { IncomeSettings, ReserveTarget, YieldPolicy } from "../plan/plan.entity";
import {
  addCents,
  cents,
  maxCents,
  minCents,
  mulRate,
  roundToHundredReais,
  subCents,
  ZERO,
  type Cents,
} from "../shared/money";
import {
  addMonths,
  isSameOrAfter,
  isWithin,
  monthNumber,
  monthOfISODate,
  monthsBetween,
  type YearMonth,
} from "../shared/month";
import { interestOn, monthlyInterestRate, priceInstallment, sacAmortization } from "./amortization";
import { plrGross, plrNet } from "./plr-tax";
import { investmentAnnualNet, monthlyFromAnnual, netAnnualYield } from "./yield";

export interface ProjectionOptions {
  /**
   * Corrigir as aplicações do valor de hoje até o vencimento pelo indexador,
   * em vez de usar o valor de face.
   *
   * A planilha usa o valor de face (equivale a `false`). Ligado, a carteira
   * rende até vencer — mais realista, e faz a atualização semanal de CDI ter
   * efeito também sobre os vencimentos.
   */
  readonly accrueInvestments: boolean;
  /** Data civil "YYYY-MM-DD" a partir da qual as aplicações são corrigidas. */
  readonly asOfDate: string;
}

export interface ProjectionInput {
  readonly startMonth: YearMonth;
  readonly horizonMonths: number;
  readonly income: IncomeSettings;
  readonly recurringItems: readonly RecurringItem[];
  readonly categories: readonly BudgetCategory[];
  readonly goals: readonly Goal[];
  readonly financing: Financing | null;
  readonly extraAmortizations: readonly ExtraAmortization[];
  readonly investments: readonly Investment[];
  readonly reserveTargets: readonly ReserveTarget[];
  readonly yieldPolicy: YieldPolicy;
  readonly rates: MarketRatesSnapshot | null;
  readonly options: ProjectionOptions;
}

/** Uma linha da projeção — as mesmas colunas da aba "4. Detalhe" da planilha. */
export interface MonthProjection {
  readonly month: YearMonth;
  /** Itens do grupo moradia + parcela do financiamento. */
  readonly housing: Cents;
  readonly otherFixed: Cents;
  readonly variable: Cents;
  readonly goals: Cents;
  readonly income: Cents;
  readonly leftover: Cents;
  readonly maturedInvestments: Cents;
  readonly toReserve: Cents;
  readonly toPayoffCash: Cents;
  readonly reserve: Cents;
  readonly payoffCash: Cents;
  readonly debt: Cents;
  /** Só a parcela, isolada da moradia — útil na tela. */
  readonly installment: Cents;
  readonly extraAmortization: Cents;
  readonly reserveTarget: Cents;
  /** O caixa já cobre o saldo devedor neste mês. */
  readonly canPayOff: boolean;
}

export interface ProjectionSummary {
  readonly months: readonly MonthProjection[];
  /** Primeiro mês em que o caixa cobre o saldo devedor. */
  readonly payoffMonth: YearMonth | null;
  readonly minCash: Cents;
  readonly minCashMonth: YearMonth | null;
  /** Sobra do primeiro mês da projeção. */
  readonly leftoverFirstMonth: Cents;
  /** Sobra de um mês típico depois da mudança: só salário, sem metas nem 13º. */
  readonly typicalLeftoverAfterMove: Cents;
  /** Custo de vida do primeiro mês com parcela — base do alvo da reserva. */
  readonly costOfLivingAfterMove: Cents;
  /**
   * Quanto guardar a mais por mês para o caixa nunca ficar negativo.
   * Zero quando o plano já fecha.
   */
  readonly monthlyTopUpToFixHole: Cents;
  readonly netAnnualYield: number;
}

function sumRecurring(items: readonly RecurringItem[], month: YearMonth, group: ItemGroup): Cents {
  let total = 0;
  for (const item of items) {
    if (!item.active || item.group !== group) continue;
    if (!isWithin(month, item.startsOn, item.endsOn)) continue;
    total += item.direction === ItemDirection.EXPENSE ? item.amount : -item.amount;
  }
  return cents(total);
}

function sumVariableBudget(categories: readonly BudgetCategory[]): Cents {
  return addCents(...categories.filter((c) => c.active).map((c) => c.monthlyBudget));
}

function sumGoalsDue(goals: readonly Goal[], month: YearMonth): Cents {
  return addCents(
    ...goals
      .filter((g) => g.status === GoalStatus.PLANNED && g.targetMonth === month)
      .map((g) => g.amount)
  );
}

/**
 * Renda do mês: salário já reajustado + as entradas sazonais (PLR, abono de
 * férias, 13º rateado). O auxílio home office e afins não entram aqui — são
 * `RecurringItem` de direção INCOME e já vêm abatidos do grupo a que pertencem.
 */
function monthlyIncome(income: IncomeSettings, month: YearMonth, salary: Cents): Cents {
  let total: number = salary;
  const m = monthNumber(month);

  if (m === income.plrMonth) {
    total += plrNet(plrGross(income.grossSalary, income.plrGrossSalaries));
  }
  if (m === income.vacationMonth) {
    total += income.vacationBonus;
  }
  if (income.thirteenthMonths.includes(m) && income.thirteenthMonths.length > 0) {
    total += income.thirteenthNet / income.thirteenthMonths.length;
  }

  return cents(total);
}

/** Valor que uma aplicação traz ao vencer. */
function maturityValue(investment: Investment, input: ProjectionInput): Cents {
  if (!input.options.accrueInvestments) return investment.amount;

  const months = monthsBetween(
    monthOfISODate(input.options.asOfDate),
    monthOfISODate(investment.maturityDate)
  );
  if (months <= 0) return investment.amount;

  const annual = investmentAnnualNet(investment, input.rates, input.yieldPolicy.incomeTaxRate);
  return cents(investment.amount * Math.pow(1 + monthlyFromAnnual(annual), months));
}

function reserveMonthsFor(targets: readonly ReserveTarget[], month: YearMonth): number {
  const applicable = targets
    .filter((t) => isSameOrAfter(month, t.effectiveFrom))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0]?.months ?? 0;
}

interface BaseRow {
  month: YearMonth;
  housing: Cents;
  otherFixed: Cents;
  variable: Cents;
  goals: Cents;
  income: Cents;
  leftover: Cents;
  maturedInvestments: Cents;
  debt: Cents;
  installment: Cents;
  extraAmortization: Cents;
}

/**
 * Primeira passada: tudo que não depende do caixa — despesas, renda, parcela e
 * saldo devedor. Separada da alocação porque o alvo da reserva depende do custo
 * de vida do primeiro mês COM parcela, que só se conhece depois de percorrer os
 * meses.
 */
function computeBaseRows(input: ProjectionInput): BaseRow[] {
  const { financing, income } = input;
  const monthlyRate = financing ? monthlyInterestRate(financing.annualInterest) : 0;
  const fixedAmortization = financing
    ? sacAmortization(financing.principal, financing.termMonths)
    : ZERO;
  const priceValue =
    financing && financing.system === AmortizationSystem.PRICE
      ? priceInstallment(financing.principal, monthlyRate, financing.termMonths)
      : ZERO;
  const tr =
    financing?.applyReferenceRate && input.rates?.referenceRateMonthly
      ? input.rates.referenceRateMonthly
      : 0;

  const variable = sumVariableBudget(input.categories);
  const extraByMonth = new Map<YearMonth, Cents>();
  for (const extra of input.extraAmortizations) {
    extraByMonth.set(extra.month, addCents(extraByMonth.get(extra.month) ?? ZERO, extra.amount));
  }
  const maturitiesByMonth = new Map<YearMonth, Cents>();
  for (const investment of input.investments) {
    const month = monthOfISODate(investment.maturityDate);
    maturitiesByMonth.set(
      month,
      addCents(maturitiesByMonth.get(month) ?? ZERO, maturityValue(investment, input))
    );
  }

  const rows: BaseRow[] = [];
  let salary = income.netSalary;
  let debt = financing ? financing.principal : ZERO;

  for (let i = 0; i < input.horizonMonths; i++) {
    const month = addMonths(input.startMonth, i);

    // Reajuste anual: aplicado no mês configurado, a partir do segundo mês da
    // projeção (o salário do primeiro mês é o que você recebe hoje).
    if (i > 0 && monthNumber(month) === income.raiseMonth) {
      salary = cents(salary * (1 + income.annualRaise));
    }

    const financingActive =
      financing !== null && isSameOrAfter(month, financing.firstInstallmentMonth);

    let installment = ZERO;
    let extraAmortization = ZERO;

    if (financing && financingActive && debt > 0) {
      const corrected = tr > 0 ? cents(debt * (1 + tr)) : debt;
      const remainingMonths = Math.max(
        1,
        financing.termMonths - monthsBetween(financing.firstInstallmentMonth, month)
      );

      const interest = interestOn(corrected, monthlyRate);
      const amortization =
        financing.system === AmortizationSystem.PRICE
          ? minCents(subCents(priceValue, interest), corrected)
          : tr > 0
            ? minCents(cents(corrected / remainingMonths), corrected)
            : minCents(fixedAmortization, corrected);

      installment = addCents(interest, amortization, financing.insuranceMonthly);
      extraAmortization = minCents(
        extraByMonth.get(month) ?? ZERO,
        subCents(corrected, amortization)
      );
      debt = maxCents(subCents(subCents(corrected, amortization), extraAmortization), ZERO);
    }

    const housing = addCents(
      sumRecurring(input.recurringItems, month, ItemGroup.HOUSING),
      installment
    );
    const otherFixed = sumRecurring(input.recurringItems, month, ItemGroup.FIXED);
    const goalsDue = sumGoalsDue(input.goals, month);
    const monthIncome = monthlyIncome(income, month, salary);

    rows.push({
      month,
      housing,
      otherFixed,
      variable,
      goals: goalsDue,
      income: monthIncome,
      leftover: cents(monthIncome - housing - otherFixed - variable - goalsDue),
      maturedInvestments: maturitiesByMonth.get(month) ?? ZERO,
      debt,
      installment,
      extraAmortization,
    });
  }

  return rows;
}

export function projectPlan(input: ProjectionInput): ProjectionSummary {
  const base = computeBaseRows(input);

  // Custo de vida usado no alvo da reserva: o do primeiro mês com parcela — o
  // mês em que a moradia dá o salto e o aperto começa de verdade.
  const firstWithInstallment = base.find((row) => row.installment > 0) ?? base[0];
  const costOfLivingAfterMove = firstWithInstallment
    ? addCents(
        firstWithInstallment.housing,
        firstWithInstallment.otherFixed,
        firstWithInstallment.variable
      )
    : ZERO;

  const annualYield = netAnnualYield(input.yieldPolicy, input.rates);
  const monthlyYield = monthlyFromAnnual(annualYield);

  const months: MonthProjection[] = [];
  let reserve = input.yieldPolicy.cashOnHand;
  let payoffCash = ZERO;

  for (let i = 0; i < base.length; i++) {
    const row = base[i];
    const reserveTarget = roundToHundredReais(
      cents(costOfLivingAfterMove * reserveMonthsFor(input.reserveTargets, row.month))
    );

    const available = addCents(row.leftover, row.maturedInvestments);
    // Reserva primeiro: só o que passa do alvo vai para o caixa de quitação.
    const toReserve =
      available <= 0 ? ZERO : minCents(available, maxCents(subCents(reserveTarget, reserve), ZERO));
    const toPayoffCash = subCents(available, toReserve);

    reserve = addCents(reserve, toReserve);
    payoffCash =
      i === 0
        ? toPayoffCash
        : subCents(
            addCents(mulRate(payoffCash, 1 + monthlyYield), toPayoffCash),
            row.extraAmortization
          );

    months.push({
      month: row.month,
      housing: row.housing,
      otherFixed: row.otherFixed,
      variable: row.variable,
      goals: row.goals,
      income: row.income,
      leftover: row.leftover,
      maturedInvestments: row.maturedInvestments,
      toReserve,
      toPayoffCash,
      reserve,
      payoffCash,
      debt: row.debt,
      installment: row.installment,
      extraAmortization: row.extraAmortization,
      reserveTarget,
      canPayOff: row.debt > 0 && payoffCash >= row.debt,
    });
  }

  const payoff = months.find((m) => m.canPayOff) ?? null;
  const minCashRow = months.reduce<MonthProjection | null>(
    (worst, current) => (worst === null || current.payoffCash < worst.payoffCash ? current : worst),
    null
  );
  const minCash = minCashRow?.payoffCash ?? ZERO;

  // Reforço para fechar o buraco: o rombo dividido pelos meses até ele acontecer.
  const monthsUntilHole = minCashRow
    ? Math.max(1, monthsBetween(input.startMonth, minCashRow.month))
    : 1;
  const monthlyTopUpToFixHole = minCash < 0 ? cents(-minCash / monthsUntilHole) : ZERO;

  const typicalLeftoverAfterMove = firstWithInstallment
    ? cents(
        input.income.netSalary -
          firstWithInstallment.housing -
          firstWithInstallment.otherFixed -
          firstWithInstallment.variable
      )
    : ZERO;

  return {
    months,
    payoffMonth: payoff?.month ?? null,
    minCash,
    minCashMonth: minCashRow?.month ?? null,
    leftoverFirstMonth: months[0]?.leftover ?? ZERO,
    typicalLeftoverAfterMove,
    costOfLivingAfterMove,
    monthlyTopUpToFixHole,
    netAnnualYield: annualYield,
  };
}
