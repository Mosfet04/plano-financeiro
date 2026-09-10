"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { YearMonth } from "@/core/domain/shared/month";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM");

const settleSchema = z.object({
  month: monthSchema,
  note: z.string().trim().max(300).nullable().default(null),
});

/** Fechar ou reabrir um mês move o começo da projeção — revalida tudo que a mostra. */
function revalidateAll() {
  revalidatePath("/mes");
  revalidatePath("/resumo");
  revalidatePath("/projecao");
  revalidatePath("/premissas");
}

export async function settleMonth(input: z.input<typeof settleSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const result = await ctx.container.useCases.settleMonth.execute({
    planId: ctx.planId,
    month: parsed.data.month as YearMonth,
    note: parsed.data.note,
  });
  if (!result.ok) return { ok: false as const, error: result.error.message };

  revalidateAll();
  return { ok: true as const };
}

export async function reopenMonth(input: z.input<typeof settleSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.closings.findByMonth(
    ctx.planId,
    parsed.data.month as YearMonth
  );
  // Confere o dono antes de apagar: o mês vem do cliente e não é confiável.
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.closings.delete(existing.id);
  revalidateAll();
  return { ok: true as const };
}
