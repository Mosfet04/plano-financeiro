import { describe, expect, it, vi } from "vitest";

import type { Clock, IdGenerator, NewPlanData, PlanRepository } from "@/core/application/ports";
import {
  CreatePlanUseCase,
  DEFAULT_RESERVE_MONTHS,
} from "@/core/application/use-cases/create-plan.use-case";
import type { Plan } from "@/core/domain/plan/plan.entity";

const NOW = new Date("2026-08-30T12:00:00Z");

function build(existing: Plan | null = null) {
  const created: NewPlanData[] = [];
  let counter = 0;

  const plans = {
    findByUserId: vi.fn().mockResolvedValue(existing),
    create: vi.fn(async (data: NewPlanData) => {
      created.push(data);
      return data.plan;
    }),
  } as unknown as PlanRepository;

  const ids: IdGenerator = { generate: () => `id-${++counter}` };
  const clock: Clock = { now: () => NOW, today: () => "2026-08-30" };

  return { useCase: new CreatePlanUseCase(plans, ids, clock), plans, created };
}

describe("CreatePlanUseCase", () => {
  it("cria as três linhas sem as quais o plano não carrega", async () => {
    const { useCase, created } = build();

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);

    // `loadSnapshot` devolve null sem income e yield: um plano só com a linha
    // em `plans` deixaria a pessoa presa na tela de "sem plano".
    const [data] = created;
    expect(data.plan.userId).toBe("user-1");
    expect(data.income.planId).toBe(data.plan.id);
    expect(data.yieldPolicy.planId).toBe(data.plan.id);
  });

  it("começa no mês de hoje, pelo relógio do app", async () => {
    const { useCase, created } = build();

    await useCase.execute({ userId: "user-1" });

    expect(created[0].plan.startMonth).toBe("2026-08");
    expect(created[0].reserveTargets[0].effectiveFrom).toBe("2026-08");
  });

  it("nasce ligado ao CDI, que é o que faz a rotina de quinta mexer na projeção", async () => {
    const { useCase, created } = build();

    await useCase.execute({ userId: "user-1" });

    expect(created[0].yieldPolicy.mode).toBe("CDI_LINKED");
    expect(created[0].yieldPolicy.cdiPercent).toBe(1);
  });

  it("guarda o alvo de reserva padrão de três meses", async () => {
    const { useCase, created } = build();

    await useCase.execute({ userId: "user-1" });

    expect(created[0].reserveTargets).toHaveLength(1);
    expect(created[0].reserveTargets[0].months).toBe(DEFAULT_RESERVE_MONTHS);
  });

  it("cria categorias iniciais com orçamento zero", async () => {
    const { useCase, created } = build();

    await useCase.execute({ userId: "user-1" });

    const { categories } = created[0];
    expect(categories.length).toBeGreaterThan(0);
    // Zero é honesto: chutar o orçamento de outra pessoa vira número inventado
    // em que se confia. Os medidores tratam zero como 0%, não como estouro.
    expect(categories.every((category) => category.monthlyBudget === 0)).toBe(true);
    expect(categories.every((category) => category.planId === created[0].plan.id)).toBe(true);
    expect(new Set(categories.map((category) => category.id)).size).toBe(categories.length);
  });

  it("batiza o plano com o primeiro nome de quem entrou", async () => {
    const { useCase, created } = build();

    await useCase.execute({ userId: "user-1", ownerName: "João Pedro Meireles" });

    expect(created[0].plan.name).toBe("Plano de João");
  });

  it("sem nome, cai para um título genérico", async () => {
    const { useCase, created } = build();

    await useCase.execute({ userId: "user-1", ownerName: null });

    expect(created[0].plan.name).toBe("Meu plano");
  });

  it("é idempotente: quem já tem plano recebe o que já tinha", async () => {
    const existing: Plan = {
      id: "plan-existente",
      userId: "user-1",
      name: "Plano de Mateus",
      startMonth: "2026-08" as Plan["startMonth"],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const { useCase, plans, created } = build(existing);

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("plan-existente");
    // O evento `createUser` e o botão de recuperação chamam o mesmo caminho:
    // chamar duas vezes não pode criar um segundo plano.
    expect(plans.create).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
});
