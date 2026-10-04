import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildContainer } from "@/composition/container";

import { invalidBody, readBody } from "../http";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ deviceName: z.string().trim().min(1).max(60) });

/** Pública: o relógio ainda não tem token. Devolve o código que ele mostra. */
export async function POST(request: NextRequest) {
  const body = await readBody(request, bodySchema);
  if (!body) return invalidBody();

  const started = await buildContainer().useCases.devicePairing.start(body.deviceName);
  const verificationUrl = new URL("/dispositivos", request.nextUrl.origin);
  verificationUrl.searchParams.set("codigo", started.userCode);

  return NextResponse.json({ ...started, verificationUrl: verificationUrl.toString() });
}
