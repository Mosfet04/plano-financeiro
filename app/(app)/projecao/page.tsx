import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { ProjecaoClient, type ProjectionRow } from "./projecao-client";

export const dynamic = "force-dynamic";

export default async function ProjecaoPage() {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const result = await ctx.container.useCases.getProjection.execute({ planId: ctx.planId });
  if (!result.ok) notFound();

  const { projection } = result.value;

  // Só o que a tela usa atravessa a fronteira server/client — os valores já
  // estão em centavos (número puro), então serializam sem perda.
  const rows: ProjectionRow[] = projection.months.map((month) => ({
    month: month.month,
    housing: month.housing,
    otherFixed: month.otherFixed,
    variable: month.variable,
    goals: month.goals,
    income: month.income,
    leftover: month.leftover,
    maturedInvestments: month.maturedInvestments,
    cashYield: month.cashYield,
    reserve: month.reserve,
    payoffCash: month.payoffCash,
    debt: month.debt,
    canPayOff: month.canPayOff,
  }));

  return <ProjecaoClient rows={rows} payoffMonth={projection.payoffMonth} />;
}
