import {
  PaymentMethod,
  type BudgetCategory,
  type CategoryIcon,
} from "@/core/domain/budget/budget-category.entity";
import {
  YieldMode,
  type IncomeSettings,
  type Plan,
  type ReserveTarget,
  type YieldPolicy,
} from "@/core/domain/plan/plan.entity";
import { cents } from "@/core/domain/shared/money";
import { monthOfISODate } from "@/core/domain/shared/month";
import { ok, type Result } from "@/core/domain/shared/result";

import type { Clock, IdGenerator, NewPlanData, PlanRepository } from "../ports";

/** Três meses de custo de vida — o mesmo alvo inicial da planilha. */
export const DEFAULT_RESERVE_MONTHS = 3;

/**
 * Categorias iniciais, com orçamento ZERO de propósito.
 *
 * Chutar um valor para a pessoa seria pior que não ter: número inventado que
 * parece oficial vira número em que se confia. Zero é honesto — significa
 * "você ainda não definiu". Os medidores tratam zero como 0% (veja
 * `close-month.use-case`), então nada aparece estourado no primeiro dia.
 */
const STARTER_CATEGORIES: ReadonlyArray<readonly [string, string, PaymentMethod, CategoryIcon]> = [
  ["Mercado", "chart-1", PaymentMethod.MEAL_CARD, "shopping-cart"],
  ["Transporte", "chart-2", PaymentMethod.CASH, "car"],
  ["Saúde e farmácia", "chart-3", PaymentMethod.CASH, "pill"],
  ["Casa", "chart-4", PaymentMethod.CASH, "house"],
  ["Lazer", "chart-5", PaymentMethod.CASH, "star"],
  ["Assinaturas", "chart-6", PaymentMethod.CASH, "repeat"],
];

export interface CreatePlanInput {
  readonly userId: string;
  /** Nome de quem entrou, para batizar o plano. Ausente vira "Meu plano". */
  readonly ownerName?: string | null;
}

/**
 * Cria o plano vazio de um usuário novo.
 *
 * Existe porque `loadSnapshot` devolve `null` sem as linhas de `income_settings`
 * e `yield_policies`: um plano só com a linha em `plans` deixaria a pessoa presa
 * na tela de "sem plano". As três nascem juntas ou nenhuma nasce.
 *
 * Idempotente: quem já tem plano recebe o que já tinha. O primeiro login e o
 * botão de recuperação chamam o mesmo caminho, e chamar duas vezes não duplica.
 */
export class CreatePlanUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async execute(input: CreatePlanInput): Promise<Result<Plan>> {
    const existing = await this.plans.findByUserId(input.userId);
    if (existing) return ok(existing);

    const planId = this.ids.generate();
    const now = this.clock.now();
    const startMonth = monthOfISODate(this.clock.today());
    const firstName = input.ownerName?.trim().split(/\s+/)[0];

    const plan: Plan = {
      id: planId,
      userId: input.userId,
      name: firstName ? `Plano de ${firstName}` : "Meu plano",
      startMonth,
      createdAt: now,
      updatedAt: now,
    };

    const income: IncomeSettings = {
      planId,
      grossSalary: cents(0),
      netSalary: cents(0),
      annualRaise: 0,
      raiseMonth: 1,
      mealCardMonthly: cents(0),
      thirteenthNet: cents(0),
      thirteenthMonths: [11, 12],
      vacationBonus: cents(0),
      vacationMonth: 1,
      plrGrossSalaries: 0,
      plrMonth: 3,
    };

    // CDI_LINKED desde o começo: é o modo que faz a rotina de quinta mexer na
    // projeção. Em MANUAL o snapshot é gravado e a conta não muda.
    const yieldPolicy: YieldPolicy = {
      planId,
      mode: YieldMode.CDI_LINKED,
      manualAnnualNet: 0.11,
      cdiPercent: 1,
      incomeTaxRate: 0.15,
    };

    const categories: BudgetCategory[] = STARTER_CATEGORIES.map(
      ([name, color, defaultPaymentMethod, icon], index) => ({
        id: this.ids.generate(),
        planId,
        name,
        monthlyBudget: cents(0),
        defaultPaymentMethod,
        color,
        icon,
        active: true,
        sortOrder: index,
      })
    );

    const reserveTargets: ReserveTarget[] = [
      {
        id: this.ids.generate(),
        planId,
        effectiveFrom: startMonth,
        months: DEFAULT_RESERVE_MONTHS,
      },
    ];

    const data: NewPlanData = { plan, income, yieldPolicy, categories, reserveTargets };
    return ok(await this.plans.create(data));
  }
}
