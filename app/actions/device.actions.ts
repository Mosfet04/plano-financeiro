"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invalidInput, resolvePlanContext, unauthorized } from "./plan-context";

const approveSchema = z.object({ userCode: z.string().trim().min(1).max(20) });

/** Você confirmou o código do relógio: ele fica preso ao seu plano. */
export async function approvePairing(input: z.input<typeof approveSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  const result = await ctx.container.useCases.devicePairing.approve(
    parsed.data.userCode,
    ctx.planId
  );
  if (!result.ok) return { ok: false as const, error: result.error.message };

  revalidatePath("/dispositivos");
  return { ok: true as const, deviceName: result.value.deviceName };
}

const revokeSchema = z.object({ id: z.string().min(1) });

export async function revokeDevice(input: z.input<typeof revokeSchema>) {
  const ctx = await resolvePlanContext();
  if (!ctx) return unauthorized;

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return invalidInput;

  // O id vem do cliente: só revoga relógio do próprio plano.
  const device = await ctx.container.repos.devices.findById(parsed.data.id);
  if (!device || device.planId !== ctx.planId) return invalidInput;

  await ctx.container.repos.devices.save({ ...device, revokedAt: ctx.container.clock.now() });
  revalidatePath("/dispositivos");
  return { ok: true as const };
}
