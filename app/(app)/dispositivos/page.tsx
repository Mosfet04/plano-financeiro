import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { DeviceKind, isDeviceActive, type Device } from "@/core/domain/device/device.entity";

import { DispositivosClient } from "./dispositivos-client";

export const dynamic = "force-dynamic";

export default async function DispositivosPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const [{ codigo }, devices] = await Promise.all([
    searchParams,
    ctx.container.repos.devices.listByPlan(ctx.planId),
  ]);
  const now = ctx.container.clock.now();
  const active = devices.filter((device) => isDeviceActive(device, now));
  const toRow = (device: Device) => ({
    id: device.id,
    name: device.name,
    createdAt: device.createdAt.toISOString(),
    lastUsedAt: device.lastUsedAt.toISOString(),
    expiresAt: device.expiresAt.toISOString(),
  });

  return (
    <DispositivosClient
      initialCode={codigo ?? ""}
      devices={active.filter((device) => device.kind === DeviceKind.WATCH).map(toRow)}
      agentTokens={active.filter((device) => device.kind === DeviceKind.AGENT).map(toRow)}
    />
  );
}
