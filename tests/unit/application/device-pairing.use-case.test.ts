import { describe, expect, it } from "vitest";

import type {
  DevicePairingRepository,
  DeviceRepository,
  SecretGenerator,
} from "@/core/application/ports";
import { DevicePairingUseCase } from "@/core/application/use-cases/device-pairing.use-case";
import type { Device, DevicePairing } from "@/core/domain/device/device.entity";

function setup() {
  const pairings = new Map<string, DevicePairing>();
  const devices = new Map<string, Device>();
  let now = new Date("2026-10-04T12:00:00Z");
  let counter = 0;

  const pairingRepo: DevicePairingRepository = {
    findByUserCode: async (code) => [...pairings.values()].find((p) => p.userCode === code) ?? null,
    findByDeviceCodeHash: async (hash) =>
      [...pairings.values()].find((p) => p.deviceCodeHash === hash) ?? null,
    save: async (pairing) => void pairings.set(pairing.id, pairing),
    delete: async (id) => void pairings.delete(id),
    deleteExpired: async (at) => {
      for (const [id, pairing] of pairings) if (pairing.expiresAt <= at) pairings.delete(id);
    },
  };
  const deviceRepo: DeviceRepository = {
    findByTokenHash: async (hash) =>
      [...devices.values()].find((d) => d.tokenHash === hash) ?? null,
    findById: async (id) => devices.get(id) ?? null,
    listByPlan: async (planId) => [...devices.values()].filter((d) => d.planId === planId),
    save: async (device) => void devices.set(device.id, device),
  };
  const secrets: SecretGenerator = {
    token: () => `secret-${++counter}`,
    userCode: () => `CODE${String(++counter).padStart(4, "0")}`,
    hash: (value) => `hash(${value})`,
  };

  const useCase = new DevicePairingUseCase(
    pairingRepo,
    deviceRepo,
    secrets,
    { generate: () => `id-${++counter}` },
    { now: () => now, today: () => now.toISOString().slice(0, 10) }
  );
  const advance = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };

  return { useCase, devices, advance };
}

async function pairApproved(ctx: ReturnType<typeof setup>) {
  const started = await ctx.useCase.start("Galaxy Watch8");
  await ctx.useCase.approve(started.userCode.toLowerCase(), "plan-1");
  return started;
}

describe("DevicePairingUseCase", () => {
  it("o relógio só recebe o token depois da aprovação, preso ao plano de quem aprovou", async () => {
    const ctx = setup();
    const started = await ctx.useCase.start("Galaxy Watch8");

    const early = await ctx.useCase.exchange(started.deviceCode);
    expect(!early.ok && early.error.code).toBe("PAIRING_PENDING");

    const approved = await ctx.useCase.approve(started.userCode, "plan-1");
    expect(approved.ok && approved.value.deviceName).toBe("Galaxy Watch8");

    ctx.advance(5);
    const issued = await ctx.useCase.exchange(started.deviceCode);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.value.token).toMatch(/^pfw_/);

    const device = ctx.devices.get(issued.value.deviceId)!;
    expect(device.planId).toBe("plan-1");
    // O banco guarda o hash, nunca o token.
    expect(device.tokenHash).toBe(`hash(${issued.value.token})`);
  });

  it("o código serve uma vez só", async () => {
    const ctx = setup();
    const started = await pairApproved(ctx);
    await ctx.useCase.exchange(started.deviceCode);

    const again = await ctx.useCase.exchange(started.deviceCode);
    expect(!again.ok && again.error.code).toBe("PAIRING_EXPIRED");
    const reapprove = await ctx.useCase.approve(started.userCode, "plan-2");
    expect(reapprove.ok).toBe(false);
  });

  it("código vencido não aprova nem troca", async () => {
    const ctx = setup();
    const started = await ctx.useCase.start("Galaxy Watch8");
    ctx.advance(601);

    expect((await ctx.useCase.approve(started.userCode, "plan-1")).ok).toBe(false);
    const exchanged = await ctx.useCase.exchange(started.deviceCode);
    expect(!exchanged.ok && exchanged.error.code).toBe("PAIRING_EXPIRED");
  });

  it("pergunta rápido demais recebe slow_down", async () => {
    const ctx = setup();
    const started = await ctx.useCase.start("Galaxy Watch8");
    await ctx.useCase.exchange(started.deviceCode);
    ctx.advance(2);

    const fast = await ctx.useCase.exchange(started.deviceCode);
    expect(!fast.ok && fast.error.code).toBe("PAIRING_SLOW_DOWN");
  });

  it("token revogado ou parado há mais de 90 dias não autentica; uso renova o prazo", async () => {
    const ctx = setup();
    const started = await pairApproved(ctx);
    const issued = await ctx.useCase.exchange(started.deviceCode);
    if (!issued.ok) throw issued.error;
    const { token, deviceId } = issued.value;

    ctx.advance(80 * 86_400);
    expect((await ctx.useCase.authenticate(token)).ok).toBe(true);
    // O uso no dia 80 empurrou o prazo: no dia 160 ainda vale.
    ctx.advance(80 * 86_400);
    expect((await ctx.useCase.authenticate(token)).ok).toBe(true);

    ctx.advance(91 * 86_400);
    expect((await ctx.useCase.authenticate(token)).ok).toBe(false);

    expect((await ctx.useCase.authenticate("pfw_qualquer")).ok).toBe(false);
    ctx.devices.set(deviceId, { ...ctx.devices.get(deviceId)!, revokedAt: new Date() });
    expect((await ctx.useCase.authenticate(token)).ok).toBe(false);
  });
});
