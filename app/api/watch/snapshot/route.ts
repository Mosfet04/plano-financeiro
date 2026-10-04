import { NextResponse, type NextRequest } from "next/server";

import { domainError, resolveDeviceContext, unauthorized } from "../http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await resolveDeviceContext(request);
  if (!ctx) return unauthorized();

  const result = await ctx.container.useCases.watchSnapshot.execute(ctx.device.planId);
  return result.ok ? NextResponse.json(result.value) : domainError(result.error);
}
