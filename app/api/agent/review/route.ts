import { NextResponse, type NextRequest } from "next/server";

import {
  changeFromBody,
  domainError,
  invalidBody,
  readBody,
  resolveAgentContext,
  submitSchema,
  unauthorized,
} from "../http";

export const dynamic = "force-dynamic";

/** Tudo o que a revisão mensal precisa ler, numa chamada. Dinheiro em centavos. */
export async function GET(request: NextRequest) {
  const ctx = await resolveAgentContext(request);
  if (!ctx) return unauthorized();

  const result = await ctx.container.useCases.planReview.overview(ctx.device.planId);
  return result.ok ? NextResponse.json(result.value) : domainError(result.error);
}

/**
 * Entrega a revisão do mês. As sugestões não mexem no plano: aparecem no
 * /resumo, com o impacto medido pelo servidor, para você aplicar ou recusar.
 */
export async function POST(request: NextRequest) {
  const ctx = await resolveAgentContext(request);
  if (!ctx) return unauthorized();

  const body = await readBody(request, submitSchema);
  if (!body) return invalidBody();

  const result = await ctx.container.useCases.planReview.submit({
    planId: ctx.device.planId,
    summary: body.summary,
    suggestions: body.suggestions.map((suggestion) => ({
      ...suggestion,
      change: changeFromBody(suggestion.change),
    })),
  });
  return result.ok ? NextResponse.json(result.value, { status: 201 }) : domainError(result.error);
}
