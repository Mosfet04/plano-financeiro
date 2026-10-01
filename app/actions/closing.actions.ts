"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { SettleMonthInput } from "@/core/application/use-cases/settle-month.use-case";
import { reais } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM");
/** Reais na borda, como os outros formulários; vira centavos aqui. */
const money = z.number().min(0).max(100_000_000);

const turnoverSchema = z.object({
  month: monthSchema,
  balances: z
    .array(z.object({ accountId: z.string().min(1), balance: money }))
    .min(1)
    .max(50),
  redeemedInvestmentIds: z.array(z.string().min(1)).max(50).default([]),
  fgtsBalance: money.nullable().default(null),
  note: z.string().trim().max(300).nullable().default(null),
});

const monthOnlySchema = z.object({ month: monthSchema });

/** Fechar ou reabrir um mês move o começo da projeção — revalida tudo que a mostra. */
function revalidateAll() {
  revalidatePath("/mes");
  revalidatePath("/resumo");
  revalidatePath("/projecao");
  revalidatePath("/premissas");
}

/** Os ids das contas e aplicações vêm do cliente: o caso de uso confere o dono. */
function toInput(planId: string, data: z.output<typeof turnoverSchema>): SettleMonthInput {
  return {
    planId,
    month: data.month as YearMonth,
    balances: data.balances.map((entry) => ({
      accountId: entry.accountId,
      balance: reais(entry.balance),
    })),
    redeemedInvestmentIds: data.redeemedInvestmentIds,
    fgtsBalance: data.fgtsBalance === null ? null : reais(data.fgtsBalance),
    note: data.note || null,
  };
}

/** Quitação e menor caixa antes e depois da virada, sem gravar nada. */
export async function previewTurnover(input: z.input<typeof turnoverSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = turnoverSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const result = await ctx.container.useCases.settleMonth.preview(toInput(ctx.planId, parsed.data));
  if (!result.ok) return { ok: false as const, error: result.error.message };

  return { ok: true as const, value: result.value };
}

export async function settleMonth(input: z.input<typeof turnoverSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = turnoverSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const result = await ctx.container.useCases.settleMonth.execute(toInput(ctx.planId, parsed.data));
  if (!result.ok) return { ok: false as const, error: result.error.message };

  revalidateAll();
  return { ok: true as const };
}

export async function reopenMonth(input: z.input<typeof monthOnlySchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = monthOnlySchema.safeParse(input);
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
