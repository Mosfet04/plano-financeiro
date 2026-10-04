import { NextResponse, type NextRequest } from "next/server";

import { buildContainer, type AppContainer } from "@/composition/container";
import { DeviceKind, type Device } from "@/core/domain/device/device.entity";

import { bearerToken } from "../http";

export { domainError, invalidBody, readBody } from "../http";

export interface DeviceContext {
  readonly device: Device;
  readonly container: AppContainer;
}

/**
 * O `resolvePlanContext` do relógio: o plano vem do token, nunca de um id que
 * o relógio mande. Toda rota autenticada de `/api/watch` começa por aqui.
 */
export async function resolveDeviceContext(request: NextRequest): Promise<DeviceContext | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const container = buildContainer();
  const result = await container.useCases.devicePairing.authenticate(token, DeviceKind.WATCH);
  return result.ok ? { device: result.value, container } : null;
}

export const unauthorized = () =>
  NextResponse.json(
    { error: "DEVICE_UNAUTHORIZED", message: "Relógio não pareado." },
    { status: 401 }
  );
