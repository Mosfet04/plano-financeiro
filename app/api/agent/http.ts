import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildContainer, type AppContainer } from "@/composition/container";
import { DeviceKind, type Device } from "@/core/domain/device/device.entity";
import { SuggestionKind, type SuggestionChange } from "@/core/domain/review/plan-review.entity";

import { bearerToken } from "../http";

export { domainError, invalidBody, readBody } from "../http";

export interface AgentContext {
  readonly device: Device;
  readonly container: AppContainer;
}

/**
 * Igual ao do relógio: o plano vem do token, gerado em /dispositivos por quem
 * está logado. A rotina nunca diz de qual plano é.
 */
export async function resolveAgentContext(request: NextRequest): Promise<AgentContext | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const container = buildContainer();
  const result = await container.useCases.devicePairing.authenticate(token, DeviceKind.AGENT);
  return result.ok ? { device: result.value, container } : null;
}

export const unauthorized = () =>
  NextResponse.json(
    {
      error: "AGENT_UNAUTHORIZED",
      message: "Token da rotina inválido ou revogado. Gere outro em /dispositivos.",
    },
    { status: 401 }
  );

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM");
/** Centavos inteiros, como tudo que é dinheiro aqui. Teto de R$ 10 milhões. */
const centsSchema = z.number().int().min(0).max(1_000_000_000);

const changeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(SuggestionKind.SET_CATEGORY_BUDGET),
    categoryId: z.string().min(1),
    monthlyBudget: centsSchema,
  }),
  z.object({
    kind: z.literal(SuggestionKind.MOVE_GOAL),
    goalId: z.string().min(1),
    targetMonth: monthSchema.nullable(),
  }),
  z.object({
    kind: z.literal(SuggestionKind.SET_GOAL_AMOUNT),
    goalId: z.string().min(1),
    amount: centsSchema,
  }),
  z.object({
    kind: z.literal(SuggestionKind.ADD_EXTRA_AMORTIZATION),
    month: monthSchema,
    amount: centsSchema,
  }),
  z.object({ kind: z.literal(SuggestionKind.NOTE) }),
]);

/** Da borda para o domínio: aqui os números viram `Cents` e os textos, `YearMonth`. */
export const changeFromBody = (change: z.infer<typeof changeSchema>) => change as SuggestionChange;

export const simulateSchema = z.object({
  changes: z.array(changeSchema).min(1).max(10),
});

export const submitSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  suggestions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        rationale: z.string().trim().min(1).max(1500),
        change: changeSchema,
      })
    )
    .max(8),
});
