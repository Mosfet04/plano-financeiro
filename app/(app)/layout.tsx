import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth.actions";
import { resolvePlanContext } from "@/app/actions/plan-context";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/infra/auth/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ctx = await resolvePlanContext();
  if (!ctx) redirect("/sem-plano");

  // A folha de novo lançamento precisa das categorias e metas já na primeira
  // renderização — abrir e esperar carregar mataria os "dez segundos".
  const [categories, goals] = await Promise.all([
    ctx.container.repos.categories.listByPlan(ctx.planId),
    ctx.container.repos.goals.listByPlan(ctx.planId),
  ]);

  return (
    <AppShell
      userName={session.user.name ?? session.user.email ?? "Você"}
      today={ctx.container.clock.today()}
      signOutAction={signOutAction}
      categories={categories
        .filter((category) => category.active)
        .map(({ id, name, defaultPaymentMethod }) => ({ id, name, defaultPaymentMethod }))}
      goals={goals
        .filter((goal) => goal.status === "PLANNED")
        .map(({ id, name }) => ({ id, name }))}
    >
      {children}
    </AppShell>
  );
}
