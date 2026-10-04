"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const decideSchema = z.object({ id: z.string().min(1), accept: z.boolean() });

/** Aplicar ou recusar uma sugestão da revisão mensal. O caso de uso confere o dono. */
export async function decideSuggestion(input: z.input<typeof decideSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const result = await ctx.container.useCases.planReview.decide(
    ctx.planId,
    parsed.data.id,
    parsed.data.accept
  );
  if (!result.ok) return { ok: false as const, error: result.error.message };

  revalidatePath("/resumo");
  if (parsed.data.accept) {
    revalidatePath("/metas");
    revalidatePath("/mes");
    revalidatePath("/projecao");
    revalidatePath("/premissas");
  }
  return { ok: true as const };
}
