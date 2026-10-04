import { NextResponse, type NextRequest } from "next/server";

import {
  changeFromBody,
  domainError,
  invalidBody,
  readBody,
  resolveAgentContext,
  simulateSchema,
  unauthorized,
} from "../http";

export const dynamic = "force-dynamic";

/** Testa mudanças no motor real, sem gravar: quitação e menor caixa, antes e depois. */
export async function POST(request: NextRequest) {
  const ctx = await resolveAgentContext(request);
  if (!ctx) return unauthorized();

  const body = await readBody(request, simulateSchema);
  if (!body) return invalidBody();

  const result = await ctx.container.useCases.planReview.simulate(
    ctx.device.planId,
    body.changes.map(changeFromBody)
  );
  return result.ok ? NextResponse.json(result.value) : domainError(result.error);
}
