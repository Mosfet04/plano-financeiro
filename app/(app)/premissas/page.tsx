import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { PremissasClient, type PremissasData } from "./premissas-client";

export const dynamic = "force-dynamic";

export default async function PremissasPage() {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const snapshot = await ctx.container.repos.plans.loadSnapshot(ctx.planId);
  if (!snapshot) notFound();

  const data: PremissasData = {
    income: {
      grossSalary: snapshot.income.grossSalary,
      netSalary: snapshot.income.netSalary,
      annualRaise: snapshot.income.annualRaise,
      raiseMonth: snapshot.income.raiseMonth,
      mealCardMonthly: snapshot.income.mealCardMonthly,
      thirteenthNet: snapshot.income.thirteenthNet,
      thirteenthMonths: [...snapshot.income.thirteenthMonths],
      vacationBonus: snapshot.income.vacationBonus,
      vacationMonth: snapshot.income.vacationMonth,
      plrGrossSalaries: snapshot.income.plrGrossSalaries,
      plrMonth: snapshot.income.plrMonth,
    },
    recurringItems: snapshot.recurringItems.map((item) => ({
      id: item.id,
      name: item.name,
      direction: item.direction,
      group: item.group,
      amount: item.amount,
      dueDay: item.dueDay,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      active: item.active,
      sortOrder: item.sortOrder,
    })),
    categories: snapshot.categories.map((category) => ({
      id: category.id,
      name: category.name,
      monthlyBudget: category.monthlyBudget,
      defaultPaymentMethod: category.defaultPaymentMethod,
      color: category.color,
      active: category.active,
      sortOrder: category.sortOrder,
    })),
    financing: snapshot.financing
      ? {
          name: snapshot.financing.name,
          principal: snapshot.financing.principal,
          termMonths: snapshot.financing.termMonths,
          annualInterest: snapshot.financing.annualInterest,
          system: snapshot.financing.system,
          insuranceMonthly: snapshot.financing.insuranceMonthly,
          firstInstallmentMonth: snapshot.financing.firstInstallmentMonth,
          applyReferenceRate: snapshot.financing.applyReferenceRate,
        }
      : null,
    investments: snapshot.investments.map((investment) => ({
      id: investment.id,
      name: investment.name,
      amount: investment.amount,
      maturityDate: investment.maturityDate,
      indexer: investment.indexer,
      indexerValue: investment.indexerValue,
      taxExempt: investment.taxExempt,
      instruction: investment.instruction,
    })),
    cashAccounts: snapshot.cashAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      balance: account.balance,
      indexer: account.indexer,
      indexerValue: account.indexerValue,
      taxExempt: account.taxExempt,
      checkedOn: account.checkedOn,
    })),
    today: ctx.container.clock.today(),
    yieldPolicy: {
      mode: snapshot.yieldPolicy.mode,
      manualAnnualNet: snapshot.yieldPolicy.manualAnnualNet,
      cdiPercent: snapshot.yieldPolicy.cdiPercent,
      incomeTaxRate: snapshot.yieldPolicy.incomeTaxRate,
      accrueInvestments: snapshot.accrueInvestments,
    },
    reserveTargets: snapshot.reserveTargets.map((target) => ({
      id: target.id,
      effectiveFrom: target.effectiveFrom,
      months: target.months,
    })),
    referenceRateMonthly: snapshot.rates?.referenceRateMonthly ?? null,
  };

  return <PremissasClient data={data} />;
}
