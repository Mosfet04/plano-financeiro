"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PaymentMethod } from "@/core/domain/budget/budget-category.entity";
import { goalMovedByPayment, type Goal } from "@/core/domain/goal/goal.entity";
import { reais } from "@/core/domain/shared/money";
import { monthOfISODate } from "@/core/domain/shared/month";
import { TransactionKind } from "@/core/domain/transaction/transaction.entity";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const createSchema = z.object({
  date: z.iso.date(),
  description: z.string().trim().min(1).max(120),
  /** Valor em reais, como digitado no formulário. Sempre positivo. */
  amount: z.number().positive().max(1_000_000),
  kind: z.enum(["EXPENSE", "EXTRA_INCOME", "GOAL"]).default("EXPENSE"),
  categoryId: z.string().min(1).nullable().default(null),
  goalId: z.string().min(1).nullable().default(null),
  paymentMethod: z.enum(["MEAL_CARD", "CASH"]).default("CASH"),
});

export async function createTransaction(input: z.input<typeof createSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const { container, planId } = ctx;
  const data = parsed.data;

  // Gasto do orçamento precisa de categoria; meta precisa de meta.
  if (data.kind === TransactionKind.EXPENSE && !data.categoryId) {
    return { ok: false as const, error: "Escolha uma categoria." };
  }
  if (data.kind === TransactionKind.GOAL && !data.goalId) {
    return { ok: false as const, error: "Escolha a meta." };
  }

  // Categoria e meta têm que ser do próprio plano — o id vem do cliente.
  if (data.categoryId) {
    const category = await container.repos.categories.findById(data.categoryId);
    if (!category || category.planId !== planId) return invalidInput;
  }
  let goal: Goal | null = null;
  if (data.goalId) {
    goal = await container.repos.goals.findById(data.goalId);
    if (!goal || goal.planId !== planId) return invalidInput;
  }

  await container.repos.transactions.save({
    id: container.ids.generate(),
    planId,
    date: data.date,
    description: data.description,
    kind: data.kind as TransactionKind,
    categoryId: data.kind === TransactionKind.EXPENSE ? data.categoryId : null,
    goalId: data.kind === TransactionKind.GOAL ? data.goalId : null,
    paymentMethod: data.paymentMethod as PaymentMethod,
    amount: reais(data.amount),
    clientRequestId: null,
    createdAt: container.clock.now(),
  });

  // Meta paga fora do mês dela vai para o mês do pagamento — senão o pagamento
  // vira gasto comum aqui e a projeção desconta a meta de novo lá.
  const month = monthOfISODate(data.date);
  let movedGoal: { name: string; month: string } | null = null;
  if (goal && data.kind === TransactionKind.GOAL) {
    const targetMonth = goal.targetMonth;
    const paidInItsMonth =
      targetMonth !== null &&
      targetMonth !== month &&
      (await container.repos.transactions.listByMonth(planId, targetMonth)).some(
        (entry) => entry.kind === TransactionKind.GOAL && entry.goalId === goal.id
      );
    const moved = goalMovedByPayment(goal, month, paidInItsMonth);
    if (moved) {
      await container.repos.goals.save(moved);
      movedGoal = { name: moved.name, month };
      revalidatePath("/metas");
      revalidatePath("/projecao");
    }
  }

  revalidatePath("/mes");
  revalidatePath("/resumo");
  return { ok: true as const, month, movedGoal };
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteTransaction(input: z.input<typeof deleteSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  // O id vem do cliente: sem esta conferência, daria para apagar lançamento
  // de outro plano só chutando um uuid.
  const existing = await ctx.container.repos.transactions.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.transactions.delete(parsed.data.id);
  revalidatePath("/mes");
  revalidatePath("/resumo");
  return { ok: true as const };
}

const paymentMethodSchema = z.object({
  id: z.string().min(1),
  paymentMethod: z.enum(["MEAL_CARD", "CASH"]),
});

/** Troca a fonte (Dinheiro ↔ VA) de um gasto já lançado. */
export async function setTransactionPaymentMethod(input: z.input<typeof paymentMethodSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const existing = await ctx.container.repos.transactions.findById(parsed.data.id);
  if (!existing || existing.planId !== ctx.planId) return invalidInput;
  // Meta e renda extra não têm fonte: são sempre dinheiro.
  if (existing.kind !== TransactionKind.EXPENSE) return invalidInput;

  await ctx.container.repos.transactions.save({
    ...existing,
    paymentMethod: parsed.data.paymentMethod as PaymentMethod,
  });
  revalidatePath("/mes");
  revalidatePath("/resumo");
  return { ok: true as const };
}
