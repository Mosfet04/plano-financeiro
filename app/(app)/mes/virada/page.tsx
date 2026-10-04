import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { buttonVariants } from "@/components/ui/button";
import { pendingTurnover } from "@/core/domain/closing/month-closing.entity";
import { addMonths, monthOfISODate, parseMonth } from "@/core/domain/shared/month";
import { ViradaClient, type ViradaData } from "./virada-client";

export const dynamic = "force-dynamic";

export default async function ViradaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const today = ctx.container.clock.today();
  const { mes } = await searchParams;
  const parsed = mes ? parseMonth(mes) : null;

  // Sem mês na URL, a virada é a pendente — ou, sem nenhuma, a do mês passado.
  const month = parsed?.ok
    ? parsed.value
    : (pendingTurnover(
        today,
        await ctx.container.repos.closings.listByPlan(ctx.planId),
        ctx.planStartMonth
      ) ?? addMonths(monthOfISODate(today), -1));

  const result = await ctx.container.useCases.settleMonth.review({ planId: ctx.planId, month });
  if (!result.ok) {
    return (
      <div className="rounded-card bg-warning-bg mx-auto flex max-w-xl flex-col gap-3 border border-[var(--warning)] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" />
          <p className="text-sm">{result.error.message}</p>
        </div>
        <Link
          href={`/mes?mes=${month}`}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "self-end" })}
        >
          Voltar para o mês
        </Link>
      </div>
    );
  }

  const review = result.value;
  const data: ViradaData = {
    month: review.month,
    checkedOn: review.checkedOn,
    isRedo: review.existing !== null,
    note: review.existing?.note ?? "",
    summary: {
      income: review.summary.income,
      housing: review.summary.housing,
      otherFixed: review.summary.otherFixed,
      extraIncome: review.summary.extraIncome,
      variableSpent: review.summary.variableSpent,
      goalSpent: review.summary.goalSpent,
      mealCardOverflow: review.summary.mealCardOverflow,
      leftover: review.summary.leftover,
      planTarget: review.summary.planTarget,
      transactionCount: review.summary.transactions.length,
    },
    accounts: review.accounts.map(({ account, estimatedYield, expected }) => ({
      id: account.id,
      name: account.name,
      balance: account.balance,
      checkedOn: account.checkedOn,
      estimatedYield,
      expected,
    })),
    matured: review.maturedInvestments.map((investment) => ({
      id: investment.id,
      name: investment.name,
      amount: investment.amount,
      maturityDate: investment.maturityDate,
    })),
    fgts: review.fgts,
  };

  return <ViradaClient data={data} />;
}
