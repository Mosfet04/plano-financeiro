import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

import type { DomainError } from "@/core/domain/shared/result";

const STATUS_BY_CODE: Record<string, number> = {
  PLAN_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  GOAL_NOT_FOUND: 404,
  SUGGESTION_NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  SUGGESTION_ALREADY_DECIDED: 409,
  DATE_OUT_OF_RANGE: 422,
  NO_FINANCING: 422,
};

export function domainError(error: DomainError) {
  return NextResponse.json(
    { error: error.code, message: error.message },
    { status: STATUS_BY_CODE[error.code] ?? 400 }
  );
}

/** O token que vem no `Authorization: Bearer …`, ou vazio. */
export function bearerToken(request: NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

/** Lê e valida o corpo JSON. Nulo quando não é JSON ou não passa no schema. */
export async function readBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T> | null> {
  const json: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export const invalidBody = () =>
  NextResponse.json({ error: "INVALID_BODY", message: "Dados inválidos." }, { status: 400 });
