import type { BudgetCategory } from "../budget/budget-category.entity";
import type { CashAccount } from "../cash/cash-account.entity";
import { lastClosedMonth, type MonthClosing } from "../closing/month-closing.entity";
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
  endOfMonthDate,
  isBefore,
  isSameOrAfter,
  isWithin,
  monthNumber,
  monthOfISODate,
  monthsBetween,
  type YearMonth,
} from "../shared/month";
import { interestOn, monthlyInterestRate, priceInstallment, sacAmortization } from "./amortization";
import { evaluateAmortization, type AmortizationAdvice } from "./amortization-advice";
import { plrGross, plrNet } from "./plr-tax";
import {
  blendedCashAnnualNet,
  investmentAnnualNet,
  monthlyFromAnnual,
  netAnnualYield,
  totalCashBalance,
} from "./yield";

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
  /** Onde o dinheiro líquido está hoje. A soma dos saldos é o caixa de abertura. */
  readonly cashAccounts: readonly CashAccount[];
  /** Meses já fechados. A projeção começa depois do último deles. */
  readonly closings: readonly MonthClosing[];
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
  /** Rendimento creditado no mês, reserva e caixa de quitação somados. */
  readonly cashYield: Cents;
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
  /** Caixa que já existe hoje: a soma dos saldos das contas cadastradas. */
  readonly openingCash: Cents;
  /**
   * Primeiro mês projetado. Vem do último mês fechado (ou, na falta dele, do
   * saldo conferido), nunca antes do início do plano — o passado não é
   * replayado porque o caixa de hoje já o contém.
   */
  readonly startMonth: YearMonth;
  /** Último mês fechado, ou nulo se nenhum foi. */
  readonly closedThrough: YearMonth | null;
  /** Data civil já embutida no saldo de caixa. Nulo quando não há evidência. */
  readonly settledOn: string | null;
  readonly netAnnualYield: number;
  /** Taxa a que a reserva capitaliza — média das contas, ponderada pelo saldo. */
  readonly cashAnnualYield: number;
  /**
   * Vale tirar do caixa e amortizar hoje? Nulo quando não há dívida ou não há
   * caixa livre — aviso sem ação possível é barulho.
   */
  readonly amortizationAdvice: AmortizationAdvice | null;
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

/**
 * Até que data civil o passado já está dentro do saldo de caixa.
 *
 * É a data do saldo conferido — literalmente o que ela significa. O fim do
 * último mês fechado entra no `max` para o caso de o fechamento ser mais novo
 * que a última conferência; aí o saldo está velho, e o plano subestima o caixa
 * em vez de contar duas vezes o que já entrou.
 *
 * É contra esta data que se decide se uma aplicação já venceu para dentro do
 * saldo. Por data e não por mês: um mês fechado e um saldo conferido no dia 9
 * cortam em pontos diferentes do mesmo mês.
 */
function settledThroughDate(input: ProjectionInput): string | null {
  const conferredOn = latestConferredOn(input.cashAccounts);
  const closed = lastClosedMonth(input.closings);
  const closedThroughDate = closed === null ? null : endOfMonthDate(closed);

  if (conferredOn === null) return closedThroughDate;
  if (closedThroughDate === null) return conferredOn;
  return conferredOn > closedThroughDate ? conferredOn : closedThroughDate;
}

/**
 * Primeiro mês que a projeção ainda precisa projetar.
 *
 * Um mês fechado é história declarada: o caixa já contém o resultado dele
 * inteiro, e a projeção pula para o seguinte. Sem nenhum fechamento, o saldo
 * conferido é a evidência que existe, e vale o mês dele — ele está no meio do
 * caminho, mas começar antes seria replayar meses que o saldo já contém.
 *
 * Sem fechamento e sem conta, o plano roda desde o começo — é o que mantém a
 * paridade com a planilha.
 */
function resumeMonth(input: ProjectionInput): YearMonth {
  const closed = lastClosedMonth(input.closings);
  if (closed !== null) return addMonths(closed, 1);

  const conferredOn = latestConferredOn(input.cashAccounts);
  if (conferredOn !== null) return monthOfISODate(conferredOn);

  return input.startMonth;
}

/**
 * Data civil do saldo conferido mais recente, ou nulo quando não há conta
 * cadastrada.
 *
 * Vale a **mais recente** entre as contas: começar antes dela contaria em dobro
 * o dinheiro da conta mais fresca. A conta mais velha fica defasada — o plano
 * subestima o caixa em vez de inventar caixa, que é o erro certo a cometer num
 * plano cujo objetivo é não ficar no vermelho.
 */
function latestConferredOn(accounts: readonly CashAccount[]): string | null {
  let latest: string | null = null;
  for (const account of accounts) {
    if (latest === null || account.checkedOn > latest) latest = account.checkedOn;
  }
  return latest;
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
function computeBaseRows(
  input: ProjectionInput,
  startMonth: YearMonth,
  settledOn: string | null
): BaseRow[] {
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
  // Aplicação que venceu ATÉ a data já liquidada está dentro do saldo de caixa:
  // o dinheiro caiu na conta e você contou. Somá-la de novo seria contar duas
  // vezes — é o que a comparação por data resolve e a comparação por mês não
  // resolveria, porque um mês fechado e um saldo conferido no dia 9 cortam em
  // pontos diferentes do mesmo mês.
  const maturitiesByMonth = new Map<YearMonth, Cents>();
  for (const investment of input.investments) {
    if (settledOn !== null && investment.maturityDate <= settledOn) continue;
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
    const month = addMonths(startMonth, i);

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
  // O caixa de hoje já contém o passado; a projeção recomeça onde ele para de
  // conter. Replayar meses já liquidados somaria o mesmo dinheiro duas vezes.
  const settledOn = settledThroughDate(input);
  const resumesAt = resumeMonth(input);
  const startMonth = isBefore(input.startMonth, resumesAt) ? resumesAt : input.startMonth;

  // O primeiro mês projetado não deposita quando o saldo foi conferido DENTRO
  // dele: parte do mês já está no saldo e não dá para saber quanto. É o que
  // fechar o mês resolve — conferindo o saldo no fechamento, a projeção começa
  // no mês seguinte e ele deposita inteiro.
  const conferredOn = latestConferredOn(input.cashAccounts);
  const firstMonthPartiallyLived =
    conferredOn !== null && monthOfISODate(conferredOn) === startMonth;

  const base = computeBaseRows(input, startMonth, settledOn);

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

  // A reserva capitaliza à taxa de onde o dinheiro está de verdade (as contas
  // cadastradas); o caixa de quitação, à política do plano, porque é dinheiro
  // que ainda vai entrar e ainda não tem endereço. Sem contas cadastradas a
  // primeira taxa é zero e a reserva não rende — é o que reproduz a planilha.
  const cashAnnualYield = blendedCashAnnualNet(
    input.cashAccounts,
    input.rates,
    input.yieldPolicy.incomeTaxRate
  );
  const cashMonthlyYield = monthlyFromAnnual(cashAnnualYield);

  const targetFor = (month: YearMonth): Cents =>
    roundToHundredReais(
      cents(costOfLivingAfterMove * reserveMonthsFor(input.reserveTargets, month))
    );

  // Abertura: o caixa que já existe entra pela MESMA regra dos meses seguintes —
  // enche a reserva até o alvo, e o que passa disso é caixa de quitação. Quando
  // era um escalar jogado direto em `reserve`, todo dinheiro acima do alvo ficava
  // preso lá e não contava nem para a quitação nem para o menor caixa do plano.
  const openingCash = totalCashBalance(input.cashAccounts);
  const openingTarget = base[0] ? targetFor(base[0].month) : ZERO;

  const months: MonthProjection[] = [];
  let reserve = minCents(openingCash, openingTarget);
  let payoffCash = subCents(openingCash, reserve);

  for (let i = 0; i < base.length; i++) {
    const row = base[i];
    const reserveTarget = targetFor(row.month);

    // Rendimento antes da alocação: o alvo da reserva é conferido contra o saldo
    // já corrigido, senão o mês deposita a mais e estoura o alvo.
    const grownReserve = i === 0 ? reserve : mulRate(reserve, 1 + cashMonthlyYield);
    const grownPayoffCash = i === 0 ? payoffCash : mulRate(payoffCash, 1 + monthlyYield);
    const cashYield = addCents(
      subCents(grownReserve, reserve),
      subCents(grownPayoffCash, payoffCash)
    );
    reserve = grownReserve;
    payoffCash = grownPayoffCash;

    const available =
      i === 0 && firstMonthPartiallyLived ? ZERO : addCents(row.leftover, row.maturedInvestments);
    // Reserva primeiro: só o que passa do alvo vai para o caixa de quitação.
    const toReserve =
      available <= 0 ? ZERO : minCents(available, maxCents(subCents(reserveTarget, reserve), ZERO));
    const toPayoffCash = subCents(available, toReserve);

    reserve = addCents(reserve, toReserve);
    payoffCash =
      i === 0
        ? addCents(payoffCash, toPayoffCash)
        : subCents(addCents(payoffCash, toPayoffCash), row.extraAmortization);

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
      cashYield,
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
  const monthsUntilHole = minCashRow ? Math.max(1, monthsBetween(startMonth, minCashRow.month)) : 1;
  const monthlyTopUpToFixHole = minCash < 0 ? cents(-minCash / monthsUntilHole) : ZERO;

  const typicalLeftoverAfterMove = firstWithInstallment
    ? cents(
        input.income.netSalary -
          firstWithInstallment.housing -
          firstWithInstallment.otherFixed -
          firstWithInstallment.variable
      )
    : ZERO;

  // A decisão é sobre o dinheiro de hoje, não sobre o do primeiro mês do plano:
  // usa a linha do mês corrente, ou a primeira quando a projeção começa à frente.
  const currentMonth = monthOfISODate(input.options.asOfDate);
  const currentRow = months.find((month) => month.month === currentMonth) ?? months[0];

  const amortizationAdvice =
    input.financing && currentRow
      ? evaluateAmortization({
          netAnnualYield: annualYield,
          financingAnnualInterest: input.financing.annualInterest,
          referenceRateMonthly: input.rates?.referenceRateMonthly ?? null,
          // A TR corrige o saldo devedor exista ou não no modelo de projeção:
          // deixá-la fora da comparação faria o aviso disparar tarde demais.
          includeReferenceRate: true,
          availableCash: currentRow.payoffCash,
          remainingDebt: currentRow.debt,
        })
      : null;

  return {
    months,
    payoffMonth: payoff?.month ?? null,
    minCash,
    minCashMonth: minCashRow?.month ?? null,
    leftoverFirstMonth: months[0]?.leftover ?? ZERO,
    typicalLeftoverAfterMove,
    costOfLivingAfterMove,
    monthlyTopUpToFixHole,
    openingCash,
    startMonth,
    closedThrough: lastClosedMonth(input.closings),
    settledOn,
    netAnnualYield: annualYield,
    cashAnnualYield,
    amortizationAdvice,
  };
}
