import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { isDeviceActive } from "@/core/domain/device/device.entity";

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

  return (
    <DispositivosClient
      initialCode={codigo ?? ""}
      devices={devices
        .filter((device) => isDeviceActive(device, now))
        .map((device) => ({
          id: device.id,
          name: device.name,
          createdAt: device.createdAt.toISOString(),
          lastUsedAt: device.lastUsedAt.toISOString(),
          expiresAt: device.expiresAt.toISOString(),
        }))}
    />
  );
}
