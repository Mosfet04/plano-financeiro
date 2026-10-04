import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { isMonthOver, pendingTurnover } from "@/core/domain/closing/month-closing.entity";
import { addMonths, endOfMonthDate, monthOfISODate, parseMonth } from "@/core/domain/shared/month";
import { MesClient, type MesData } from "./mes-client";

export const dynamic = "force-dynamic";

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const today = ctx.container.clock.today();
  const currentMonth = monthOfISODate(today);

  const { mes } = await searchParams;
  const parsed = mes ? parseMonth(mes) : null;
  // Fora do intervalo do plano não há mês para mostrar: volta para o corrente.
  const month =
    parsed?.ok && parsed.value >= ctx.planStartMonth && parsed.value <= currentMonth
      ? parsed.value
      : currentMonth;

  const [result, categories, closings] = await Promise.all([
    ctx.container.useCases.closeMonth.execute({ planId: ctx.planId, month }),
    ctx.container.repos.categories.listByPlan(ctx.planId),
    ctx.container.repos.closings.listByPlan(ctx.planId),
  ]);
  if (!result.ok) notFound();

  const closing = result.value;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const settled = closings.find((entry) => entry.month === month) ?? null;
  const previous = addMonths(month, -1);
  const turnover = pendingTurnover(today, closings, ctx.planStartMonth);

  const data: MesData = {
    month: closing.month,
    previousMonth: previous >= ctx.planStartMonth ? previous : null,
    nextMonth: month < currentMonth ? addMonths(month, 1) : null,
    lastDay: endOfMonthDate(month),
    // O aviso de cima só aparece quando a virada pendente é de outro mês; no
    // próprio mês, a barra de fechamento já faz o convite.
    pendingTurnover: turnover !== month ? turnover : null,
    today,
    settled: settled
      ? {
          leftover: settled.leftover,
          planTarget: settled.planTarget,
          cash: settled.cash,
          closedAt: settled.closedAt.toISOString(),
        }
      : null,
    isOver: isMonthOver(month, today),
    hasCashAccounts: (await ctx.container.repos.cashAccounts.listByPlan(ctx.planId)).length > 0,
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
    income: closing.income,
    housing: closing.housing,
    otherFixed: closing.otherFixed,
    extraIncome: closing.extraIncome,
    variableSpent: closing.variableSpent,
    goalSpent: closing.goalSpent,
    mealCardOverflow: closing.mealCardOverflow,
    leftover: closing.leftover,
    planTarget: closing.planTarget,
    savingsBoost: closing.savingsBoost,
    onPlan: closing.onPlan,
    slack: closing.slack,
    allowance: closing.allowance,
    transactions: closing.transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      kind: transaction.kind,
      categoryName: transaction.categoryId
        ? (categoryNames.get(transaction.categoryId) ?? null)
        : null,
      paymentMethod: transaction.paymentMethod,
      fromWatch: transaction.clientRequestId !== null,
      amount: transaction.amount,
    })),
  };

  return <MesClient data={data} />;
}
