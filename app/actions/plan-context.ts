import { buildContainer, type AppContainer } from "@/composition/container";
import type { YearMonth } from "@/core/domain/shared/month";
import { auth } from "@/infra/auth/auth";

export interface PlanContext {
  readonly userId: string;
  readonly planId: string;
  /** Primeiro mês do plano — antes dele não há o que mostrar nem fechar. */
  readonly planStartMonth: YearMonth;
  readonly container: AppContainer;
}

/**
 * Sessão + plano do usuário logado, resolvidos de uma vez.
 *
 * Toda action e toda página começa por aqui: sem isto, um `planId` vindo do
 * cliente seria aceito sem checagem de dono.
 */
export async function resolvePlanContext(): Promise<PlanContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const container = buildContainer();
  const plan = await container.repos.plans.findByUserId(userId);
  if (!plan) return null;

  return { userId, planId: plan.id, planStartMonth: plan.startMonth, container };
}

export type ActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; error: string };

export const unauthorized = { ok: false as const, error: "Sessão expirada. Entre de novo." };
export const invalidInput = { ok: false as const, error: "Dados inválidos." };
