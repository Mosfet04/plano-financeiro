import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { GoalStatus } from "@/core/domain/goal/goal.entity";
import { addCents } from "@/core/domain/shared/money";
import { MetasClient, type GoalRow } from "./metas-client";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const result = await ctx.container.useCases.getProjection.execute({ planId: ctx.planId });
  if (!result.ok) notFound();

  const { snapshot, projection } = result.value;

  const goals: GoalRow[] = snapshot.goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    amount: goal.amount,
    targetMonth: goal.targetMonth,
    fundingSource: goal.fundingSource,
    note: goal.note,
    status: goal.status,
    sortOrder: goal.sortOrder,
  }));

  const totalPlanned = addCents(
    ...snapshot.goals
      .filter((goal) => goal.status === GoalStatus.PLANNED && goal.targetMonth !== null)
      .map((goal) => goal.amount)
  );

  return (
    <MetasClient goals={goals} payoffMonth={projection.payoffMonth} totalPlanned={totalPlanned} />
  );
}
