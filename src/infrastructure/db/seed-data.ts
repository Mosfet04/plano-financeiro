import { PaymentMethod, type BudgetCategory } from "@/core/domain/budget/budget-category.entity";
import {
  ItemDirection,
  ItemGroup,
  type RecurringItem,
} from "@/core/domain/expense/recurring-item.entity";
import { AmortizationSystem, type Financing } from "@/core/domain/financing/financing.entity";
import { GoalStatus, type Goal } from "@/core/domain/goal/goal.entity";
import { Indexer, type Investment } from "@/core/domain/investment/investment.entity";
import {
  YieldMode,
  type IncomeSettings,
  type Plan,
  type ReserveTarget,
  type YieldPolicy,
} from "@/core/domain/plan/plan.entity";
import { reais } from "@/core/domain/shared/money";
import { monthOf, type YearMonth } from "@/core/domain/shared/month";

/**
 * O plano como está no `Plano_Financeiro_Agosto.xlsx` de 24/08/2026.
 *
 * Fonte única: o seed de produção grava isto no banco e o teste-ouro usa a
 * mesma fábrica como entrada para comparar o motor contra os 84 meses que a
 * planilha calculou.
 */
export const START_MONTH: YearMonth = monthOf(2026, 8);
/** Mês da primeira parcela: o aluguel acaba e o custo do apê começa. */
export const MOVE_MONTH: YearMonth = monthOf(2026, 12);

export interface SeededPlan {
  readonly plan: Plan;
  readonly income: IncomeSettings;
  readonly yieldPolicy: YieldPolicy;
  readonly accrueInvestments: boolean;
  readonly recurringItems: readonly RecurringItem[];
  readonly categories: readonly BudgetCategory[];
  readonly goals: readonly Goal[];
  readonly financing: Financing;
  readonly investments: readonly Investment[];
  readonly reserveTargets: readonly ReserveTarget[];
}

export interface SeedOptions {
  readonly planId: string;
  readonly userId: string;
  readonly nextId: () => string;
  readonly now?: Date;
  /**
   * `false` reproduz a planilha (valor de face nas aplicações, 11% líquidos
   * fixos). `true` é o padrão do app: rendimento amarrado ao CDI do último
   * snapshot e aplicações corrigidas até o vencimento.
   */
  readonly liveMode?: boolean;
}

export function buildSpreadsheetPlan(options: SeedOptions): SeededPlan {
  const { planId, userId, nextId } = options;
  const now = options.now ?? new Date("2026-08-24T12:00:00Z");
  const liveMode = options.liveMode ?? true;

  let order = 0;
  const item = (
    partial: Omit<RecurringItem, "id" | "planId" | "active" | "sortOrder">
  ): RecurringItem => ({
    id: nextId(),
    planId,
    active: true,
    sortOrder: order++,
    ...partial,
  });

  const recurringItems: RecurringItem[] = [
    item({
      name: "Aluguel",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.HOUSING,
      amount: reais(1233.57),
      dueDay: 10,
      startsOn: null,
      // Pago até o mês anterior à primeira parcela.
      endsOn: monthOf(2026, 11),
    }),
    item({
      name: "Condomínio",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.HOUSING,
      amount: reais(380),
      dueDay: 10,
      startsOn: MOVE_MONTH,
      endsOn: null,
    }),
    item({
      name: "Energia",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.HOUSING,
      amount: reais(130),
      dueDay: 15,
      startsOn: MOVE_MONTH,
      endsOn: null,
    }),
    item({
      name: "IPTU",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.HOUSING,
      amount: reais(109),
      dueDay: 10,
      startsOn: MOVE_MONTH,
      endsOn: null,
    }),
    item({
      name: "Internet",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.HOUSING,
      amount: reais(99.9),
      dueDay: 20,
      startsOn: MOVE_MONTH,
      endsOn: null,
    }),
    // Entrada que abate o custo do apê — é assim que a planilha trata o auxílio.
    item({
      name: "Auxílio home office",
      direction: ItemDirection.INCOME,
      group: ItemGroup.HOUSING,
      amount: reais(200),
      dueDay: null,
      startsOn: MOVE_MONTH,
      endsOn: null,
    }),
    item({
      name: "Psicóloga",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.FIXED,
      amount: reais(400),
      dueDay: 5,
      startsOn: null,
      endsOn: null,
    }),
    item({
      name: "Smart Fit",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.FIXED,
      amount: reais(139.9),
      dueDay: 5,
      startsOn: null,
      endsOn: null,
    }),
    item({
      name: "Telefone",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.FIXED,
      amount: reais(25),
      dueDay: 20,
      startsOn: null,
      endsOn: null,
    }),
    item({
      name: "Café (assinatura)",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.FIXED,
      amount: reais(23.46),
      dueDay: 20,
      startsOn: null,
      endsOn: null,
    }),
    item({
      name: "Amazon",
      direction: ItemDirection.EXPENSE,
      group: ItemGroup.FIXED,
      amount: reais(19.9),
      dueDay: 20,
      startsOn: null,
      endsOn: null,
    }),
  ];

  const categoryDefinitions: ReadonlyArray<readonly [string, number, string]> = [
    ["Transporte", 250, "chart-1"],
    ["Farmácia e saúde", 120, "chart-2"],
    ["Casa e manutenção", 180, "chart-3"],
    ["Pet (Cookie)", 150, "chart-4"],
    ["Namorada", 400, "chart-5"],
    ["Lazer e rolês", 200, "chart-6"],
    ["Compras e assinaturas", 150, "chart-7"],
  ];

  const categories: BudgetCategory[] = categoryDefinitions.map(([name, budget, color], index) => ({
    id: nextId(),
    planId,
    name,
    monthlyBudget: reais(budget),
    defaultPaymentMethod: PaymentMethod.CASH,
    color,
    active: true,
    sortOrder: index,
  }));

  const goals: Goal[] = [
    {
      id: nextId(),
      planId,
      name: "ITBI, registro e vistoria",
      amount: reais(16701.76),
      targetMonth: monthOf(2026, 12),
      fundingSource: "13º de nov/dez + caixa",
      note: "Não é adiável — sai na escritura. Confirmar se entra no financiamento.",
      status: GoalStatus.PLANNED,
      sortOrder: 0,
    },
    {
      id: nextId(),
      planId,
      name: "Mudança, móveis e acabamentos",
      amount: reais(2700),
      targetMonth: monthOf(2027, 4),
      fundingSource: "PLR de março",
      note: "Estimativa. Dezembro não comporta, por isso ficou para abril.",
      status: GoalStatus.PLANNED,
      sortOrder: 1,
    },
    {
      id: nextId(),
      planId,
      name: "Anel de noivado",
      amount: reais(7500),
      targetMonth: monthOf(2027, 4),
      fundingSource: "PLR de março",
      note: "Ouro com moissanita oval.",
      status: GoalStatus.PLANNED,
      sortOrder: 2,
    },
    {
      id: nextId(),
      planId,
      name: "Pousada em Macacos (3 noites)",
      amount: reais(3200),
      targetMonth: monthOf(2027, 10),
      fundingSource: "Sobra + caixa",
      note: "Cabana com banheira e fogueira. É o pedido.",
      status: GoalStatus.PLANNED,
      sortOrder: 3,
    },
    {
      id: nextId(),
      planId,
      name: "Viagem do casal",
      amount: reais(7000),
      targetMonth: monthOf(2028, 8),
      fundingSource: "PLR + 13º de 2028",
      note: "Cabe subir para R$ 10–12 mil sem atrasar muito a quitação.",
      status: GoalStatus.PLANNED,
      sortOrder: 4,
    },
    {
      id: nextId(),
      planId,
      name: "Quitar o apartamento",
      amount: reais(0),
      targetMonth: null,
      fundingSource: "Caixa de quitação",
      note: "Sem valor fixo: é o saldo devedor do dia.",
      status: GoalStatus.PLANNED,
      sortOrder: 5,
    },
  ];

  const investmentDefinitions: ReadonlyArray<{
    name: string;
    amount: number;
    maturityDate: string;
    indexer: Indexer;
    indexerValue: number;
    taxExempt: boolean;
    instruction: string;
  }> = [
    {
      name: "LCI BRB 103% CDI",
      amount: 7453.1,
      maturityDate: "2026-09-08",
      indexer: Indexer.CDI_PCT,
      indexerValue: 1.03,
      taxExempt: true,
      instruction: "NÃO renove. Vira reserva líquida (Tesouro Selic ou CDB de liquidez diária).",
    },
    {
      name: "CDB Digimais 115% CDI",
      amount: 1477.32,
      maturityDate: "2026-11-09",
      indexer: Indexer.CDI_PCT,
      indexerValue: 1.15,
      taxExempt: false,
      instruction: "Some à reserva. Ajuda a pagar a mudança.",
    },
    {
      name: "CDB Midway 121% CDI",
      amount: 5773.78,
      maturityDate: "2027-03-23",
      indexer: Indexer.CDI_PCT,
      indexerValue: 1.21,
      taxExempt: false,
      instruction: "Reserva já cheia: vai para o caixa de quitação.",
    },
    {
      name: "LCI BRB 100% CDI",
      amount: 1056.77,
      maturityDate: "2027-03-25",
      indexer: Indexer.CDI_PCT,
      indexerValue: 1.0,
      taxExempt: true,
      instruction: "Caixa de quitação.",
    },
    {
      name: "LCA Original 91% CDI",
      amount: 4864.49,
      maturityDate: "2027-04-26",
      indexer: Indexer.CDI_PCT,
      indexerValue: 0.91,
      taxExempt: true,
      instruction: "91% do CDI é fraco mesmo isento. Não renove nesse papel.",
    },
    {
      name: "CDB DM Financeira 13% a.a.",
      amount: 1323.56,
      maturityDate: "2027-05-10",
      indexer: Indexer.PREFIXED,
      indexerValue: 0.13,
      taxExempt: false,
      instruction: "Prefixado. Com a Selic caindo pode ficar bom — leve até o fim.",
    },
    {
      name: "CDB Ouribank 112% CDI",
      amount: 1351.83,
      maturityDate: "2027-07-12",
      indexer: Indexer.CDI_PCT,
      indexerValue: 1.12,
      taxExempt: false,
      instruction: "Último a vencer.",
    },
  ];

  return {
    plan: {
      id: planId,
      userId,
      name: "Plano do apartamento",
      startMonth: START_MONTH,
      createdAt: now,
      updatedAt: now,
    },
    income: {
      planId,
      grossSalary: reais(8500),
      netSalary: reais(6354.88),
      annualRaise: 0.05,
      raiseMonth: 1,
      mealCardMonthly: reais(2100),
      thirteenthNet: reais(6354.88),
      thirteenthMonths: [11, 12],
      vacationBonus: reais(2054),
      vacationMonth: 7,
      plrGrossSalaries: 3,
      plrMonth: 3,
    },
    yieldPolicy: {
      planId,
      mode: liveMode ? YieldMode.CDI_LINKED : YieldMode.MANUAL,
      // 11% líquidos é o que a planilha assume na célula '5. Números'!C58.
      manualAnnualNet: 0.11,
      cdiPercent: 1.0,
      incomeTaxRate: 0.15,
    },
    accrueInvestments: liveMode,
    recurringItems,
    categories,
    goals,
    financing: {
      id: nextId(),
      planId,
      name: "CAIXA — SAC/TR",
      principal: reais(260000),
      termMonths: 420,
      annualInterest: 0.0766,
      system: AmortizationSystem.SAC,
      insuranceMonthly: reais(70),
      firstInstallmentMonth: MOVE_MONTH,
      extraAmortizationEffect: "SHORTEN_TERM",
      // A planilha assume TR = 0; ligar aqui muda todos os números do plano.
      applyReferenceRate: false,
    },
    investments: investmentDefinitions.map((definition) => ({
      id: nextId(),
      planId,
      ...definition,
      amount: reais(definition.amount),
    })),
    reserveTargets: [
      { id: nextId(), planId, effectiveFrom: START_MONTH, months: 3 },
      { id: nextId(), planId, effectiveFrom: monthOf(2028, 1), months: 6 },
    ],
  };
}
