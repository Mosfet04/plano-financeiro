"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { GoalStatus } from "@/core/domain/goal/goal.entity";
import { reais } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM");

const saveSchema = z.object({
  /** Ausente = meta nova. */
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  amount: z.number().min(0).max(10_000_000),
  targetMonth: monthSchema.nullable().default(null),
  fundingSource: z.string().trim().max(120).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
  status: z.enum(["PLANNED", "DONE", "CANCELLED"]).default("PLANNED"),
  sortOrder: z.number().int().min(0).default(0),
});

export async function saveGoal(input: z.input<typeof saveSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const data = parsed.data;
  const { container, planId } = ctx;

  if (data.id) {
    const existing = await container.repos.goals.findById(data.id);
    if (!existing || existing.planId !== planId) return invalidInput;
  }

  await container.repos.goals.save({
    id: data.id ?? container.ids.generate(),
    planId,
    name: data.name,
    amount: reais(data.amount),
    targetMonth: (data.targetMonth as YearMonth | null) ?? null,
    fundingSource: data.fundingSource,
    note: data.note,
    status: data.status as GoalStatus,
    sortOrder: data.sortOrder,
  });

  revalidatePath("/metas");
  revalidatePath("/projecao");
  revalidatePath("/resumo");
  return { ok: true as const };
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteGoal(input: z.input<typeof idSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.goals.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.goals.delete(parsed.data.id);
  revalidatePath("/metas");
  revalidatePath("/projecao");
  revalidatePath("/resumo");
  return { ok: true as const };
}
