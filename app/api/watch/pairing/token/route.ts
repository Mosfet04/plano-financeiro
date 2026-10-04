import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildContainer } from "@/composition/container";

import { invalidBody, readBody } from "../../http";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ deviceCode: z.string().min(1).max(200) });

/** Os erros do polling, com os nomes da RFC 8628. */
const RFC_ERRORS: Record<string, string> = {
  PAIRING_PENDING: "authorization_pending",
  PAIRING_SLOW_DOWN: "slow_down",
  PAIRING_EXPIRED: "expired_token",
};

/** Pública: o relógio troca o segredo dele pelo token depois da aprovação. */
export async function POST(request: NextRequest) {
  const body = await readBody(request, bodySchema);
  if (!body) return invalidBody();

  const result = await buildContainer().useCases.devicePairing.exchange(body.deviceCode);
  if (!result.ok) {
    return NextResponse.json(
      { error: RFC_ERRORS[result.error.code] ?? "invalid_request", message: result.error.message },
      { status: 400 }
    );
  }
  return NextResponse.json(result.value);
}
