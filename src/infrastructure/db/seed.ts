import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { getEnv } from "../config/env";
import { getDb } from "./client";
import {
  budgetCategories,
  financings,
  goals,
  incomeSettings,
  investments,
  plans,
  recurringItems,
  reserveTargets,
  users,
  yieldPolicies,
} from "./schema";
import { buildSpreadsheetPlan } from "./seed-data";

/**
 * Cria o usuário e o plano inicial com os dados reais da planilha de agosto/2026.
 *
 * Idempotente: se já existir plano para o e-mail, não faz nada. Para recomeçar
 * do zero, apague o plano (as tabelas filhas caem por cascade).
 */
async function seed() {
  const env = getEnv();
  const db = getDb();
  const email = env.ALLOWED_EMAILS[0];

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  const userId = existingUser?.id ?? randomUUID();

  if (!existingUser) {
    await db.insert(users).values({ id: userId, email, name: "Mateus" });
    console.log(`✓ usuário criado: ${email}`);
  }

  const existingPlan = await db.query.plans.findFirst({ where: eq(plans.userId, userId) });
  if (existingPlan) {
    console.log(`• plano "${existingPlan.name}" já existe (${existingPlan.id}) — nada a fazer.`);
    return;
  }

  const seeded = buildSpreadsheetPlan({
    planId: randomUUID(),
    userId,
    nextId: () => randomUUID(),
  });

  await db.insert(plans).values({
    id: seeded.plan.id,
    userId,
    name: seeded.plan.name,
    startMonth: seeded.plan.startMonth,
  });

  await db.insert(incomeSettings).values({
    planId: seeded.plan.id,
    grossSalaryCents: seeded.income.grossSalary,
    netSalaryCents: seeded.income.netSalary,
    annualRaise: seeded.income.annualRaise,
    raiseMonth: seeded.income.raiseMonth,
    mealCardMonthlyCents: seeded.income.mealCardMonthly,
    thirteenthNetCents: seeded.income.thirteenthNet,
    thirteenthMonths: seeded.income.thirteenthMonths.join(","),
    vacationBonusCents: seeded.income.vacationBonus,
    vacationMonth: seeded.income.vacationMonth,
    plrGrossSalaries: seeded.income.plrGrossSalaries,
    plrMonth: seeded.income.plrMonth,
  });

  await db.insert(yieldPolicies).values({
    planId: seeded.plan.id,
    mode: seeded.yieldPolicy.mode,
    manualAnnualNet: seeded.yieldPolicy.manualAnnualNet,
    cdiPercent: seeded.yieldPolicy.cdiPercent,
    incomeTaxRate: seeded.yieldPolicy.incomeTaxRate,
    cashOnHandCents: seeded.yieldPolicy.cashOnHand,
    accrueInvestments: seeded.accrueInvestments ? 1 : 0,
  });

  await db.insert(recurringItems).values(
    seeded.recurringItems.map((item) => ({
      id: item.id,
      planId: item.planId,
      name: item.name,
      direction: item.direction,
      group: item.group,
      amountCents: item.amount,
      dueDay: item.dueDay,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      active: item.active,
      sortOrder: item.sortOrder,
    }))
  );

  await db.insert(budgetCategories).values(
    seeded.categories.map((category) => ({
      id: category.id,
      planId: category.planId,
      name: category.name,
      monthlyBudgetCents: category.monthlyBudget,
      defaultPaymentMethod: category.defaultPaymentMethod,
      color: category.color,
      active: category.active,
      sortOrder: category.sortOrder,
    }))
  );

  await db.insert(goals).values(
    seeded.goals.map((goal) => ({
      id: goal.id,
      planId: goal.planId,
      name: goal.name,
      amountCents: goal.amount,
      targetMonth: goal.targetMonth,
      fundingSource: goal.fundingSource,
      note: goal.note,
      status: goal.status,
      sortOrder: goal.sortOrder,
    }))
  );

  await db.insert(financings).values({
    id: seeded.financing.id,
    planId: seeded.financing.planId,
    name: seeded.financing.name,
    principalCents: seeded.financing.principal,
    termMonths: seeded.financing.termMonths,
    annualInterest: seeded.financing.annualInterest,
    system: seeded.financing.system,
    insuranceMonthlyCents: seeded.financing.insuranceMonthly,
    firstInstallmentMonth: seeded.financing.firstInstallmentMonth,
    applyReferenceRate: seeded.financing.applyReferenceRate,
  });

  await db.insert(investments).values(
    seeded.investments.map((investment) => ({
      id: investment.id,
      planId: investment.planId,
      name: investment.name,
      amountCents: investment.amount,
      maturityDate: investment.maturityDate,
      indexer: investment.indexer,
      indexerValue: investment.indexerValue,
      taxExempt: investment.taxExempt,
      instruction: investment.instruction,
    }))
  );

  await db.insert(reserveTargets).values(
    seeded.reserveTargets.map((target) => ({
      id: target.id,
      planId: target.planId,
      effectiveFrom: target.effectiveFrom,
      months: target.months,
    }))
  );

  console.log(`✓ plano "${seeded.plan.name}" criado (${seeded.plan.id})`);
  console.log(`  ${seeded.recurringItems.length} contas recorrentes`);
  console.log(`  ${seeded.categories.length} categorias de orçamento`);
  console.log(`  ${seeded.goals.length} metas`);
  console.log(`  ${seeded.investments.length} aplicações`);
  console.log("\nRode a rotina de taxas para o primeiro snapshot:");
  console.log(
    '  curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/market-rates'
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("✗ seed falhou:", error);
    process.exit(1);
  });
