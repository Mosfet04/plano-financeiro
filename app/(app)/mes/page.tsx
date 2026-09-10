import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { monthOfISODate, parseMonth } from "@/core/domain/shared/month";
import { MesClient, type MesData } from "./mes-client";

export const dynamic = "force-dynamic";

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const { mes } = await searchParams;
  const parsed = mes ? parseMonth(mes) : null;
  const month = parsed?.ok ? parsed.value : monthOfISODate(ctx.container.clock.today());

  const [result, categories, closings] = await Promise.all([
    ctx.container.useCases.closeMonth.execute({ planId: ctx.planId, month }),
    ctx.container.repos.categories.listByPlan(ctx.planId),
    ctx.container.repos.closings.listByPlan(ctx.planId),
  ]);
  if (!result.ok) notFound();

  const closing = result.value;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const settled = closings.find((entry) => entry.month === month) ?? null;
  const currentMonth = monthOfISODate(ctx.container.clock.today());

  const data: MesData = {
    month: closing.month,
    settled: settled
      ? {
          leftover: settled.leftover,
          planTarget: settled.planTarget,
          cash: settled.cash,
          closedAt: settled.closedAt.toISOString(),
        }
      : null,
    canSettle: month <= currentMonth,
    history: closings.map((entry) => ({
      month: entry.month,
      leftover: entry.leftover,
      planTarget: entry.planTarget,
      cash: entry.cash,
    })),
    categories: closing.categories.map((entry) => ({
      id: entry.category.id,
      name: entry.category.name,
      budget: entry.budget,
      spent: entry.spent,
      remaining: entry.remaining,
      usedRatio: entry.usedRatio,
    })),
    fixedBills: closing.fixedBills.map((bill) => ({
      id: bill.item.id,
      name: bill.item.name,
      amount: bill.amount,
      dueDay: bill.dueDay,
    })),
    fixedTotal: closing.fixedTotal,
    mealCardCredited: closing.mealCardCredited,
    mealCardSpent: closing.mealCardSpent,
    mealCardRemaining: closing.mealCardRemaining,
    salary: closing.salary,
    extraIncome: closing.extraIncome,
    variableSpent: closing.variableSpent,
    goalSpent: closing.goalSpent,
    mealCardOverflow: closing.mealCardOverflow,
    leftover: closing.leftover,
    planTarget: closing.planTarget,
    onPlan: closing.onPlan,
    slack: closing.slack,
    daysRemaining: closing.daysRemaining,
    freePerDay: closing.freePerDay,
    leisurePerDay: closing.leisurePerDay,
    transactions: closing.transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      kind: transaction.kind,
      categoryName: transaction.categoryId
        ? (categoryNames.get(transaction.categoryId) ?? null)
        : null,
      paymentMethod: transaction.paymentMethod,
      amount: transaction.amount,
    })),
  };

  return <MesClient data={data} />;
}
