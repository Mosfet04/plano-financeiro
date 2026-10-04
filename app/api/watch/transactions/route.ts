import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { cents } from "@/core/domain/shared/money";

import { domainError, invalidBody, readBody, resolveDeviceContext, unauthorized } from "../http";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  idempotencyKey: z.uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  paymentMethod: z.enum(["CASH", "MEAL_CARD"]),
  categoryId: z.string().min(1),
  date: z.iso.date(),
});

/**
 * Lança um gasto e devolve o snapshot já atualizado: a tela "Lançado" mostra
 * quanto ainda dá para gastar hoje sem uma segunda ida ao servidor.
 */
export async function POST(request: NextRequest) {
  const ctx = await resolveDeviceContext(request);
  if (!ctx) return unauthorized();

  const body = await readBody(request, bodySchema);
  if (!body) return invalidBody();

  const { planId } = ctx.device;
  const recorded = await ctx.container.useCases.recordWatchTransaction.execute({
    planId,
    idempotencyKey: body.idempotencyKey,
    amount: cents(body.amountCents),
    paymentMethod: body.paymentMethod,
    categoryId: body.categoryId,
    date: body.date,
  });
  if (!recorded.ok) return domainError(recorded.error);

  const snapshot = await ctx.container.useCases.watchSnapshot.execute(planId);
  if (!snapshot.ok) return domainError(snapshot.error);

  return NextResponse.json(
    { transactionId: recorded.value.transaction.id, snapshot: snapshot.value },
    { status: recorded.value.replayed ? 200 : 201 }
  );
}
