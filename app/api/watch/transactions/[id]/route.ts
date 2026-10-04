import { NextResponse, type NextRequest } from "next/server";

import { domainError, resolveDeviceContext, unauthorized } from "../../http";

export const dynamic = "force-dynamic";

/**
 * O "Desfazer" do relógio. Só apaga lançamento do próprio plano e que veio de
 * um relógio — o resto se apaga pelo PWA.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveDeviceContext(request);
  if (!ctx) return unauthorized();

  const { id } = await params;
  const { planId } = ctx.device;
  const existing = await ctx.container.repos.transactions.findById(id);
  if (!existing || existing.planId !== planId || existing.clientRequestId === null) {
    return NextResponse.json(
      { error: "TRANSACTION_NOT_FOUND", message: "Lançamento não encontrado." },
      { status: 404 }
    );
  }

  await ctx.container.repos.transactions.delete(id);

  const snapshot = await ctx.container.useCases.watchSnapshot.execute(planId);
  return snapshot.ok
    ? NextResponse.json({ snapshot: snapshot.value })
    : domainError(snapshot.error);
}
