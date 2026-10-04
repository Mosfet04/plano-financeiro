import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

import { buildContainer, type AppContainer } from "@/composition/container";
import type { Device } from "@/core/domain/device/device.entity";
import type { DomainError } from "@/core/domain/shared/result";

export interface DeviceContext {
  readonly device: Device;
  readonly container: AppContainer;
}

/**
 * O `resolvePlanContext` do relógio: o plano vem do token, nunca de um id que
 * o relógio mande. Toda rota autenticada de `/api/watch` começa por aqui.
 */
export async function resolveDeviceContext(request: NextRequest): Promise<DeviceContext | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return null;

  const container = buildContainer();
  const result = await container.useCases.devicePairing.authenticate(token);
  return result.ok ? { device: result.value, container } : null;
}

export const unauthorized = () =>
  NextResponse.json(
    { error: "DEVICE_UNAUTHORIZED", message: "Relógio não pareado." },
    { status: 401 }
  );

const STATUS_BY_CODE: Record<string, number> = {
  PLAN_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  DATE_OUT_OF_RANGE: 422,
};

export function domainError(error: DomainError) {
  return NextResponse.json(
    { error: error.code, message: error.message },
    { status: STATUS_BY_CODE[error.code] ?? 400 }
  );
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
