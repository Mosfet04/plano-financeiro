import { createMyPlan } from "@/app/actions/plan.actions";
import { Button } from "@/components/ui/button";

/**
 * Onde cai quem entrou mas ainda não tem plano.
 *
 * No caminho normal ninguém vê esta tela: o evento `createUser` cria o plano
 * vazio durante o primeiro login. Ela é a saída para os casos em que isso não
 * aconteceu — usuário vindo do seed, ou falha de banco no meio do login.
 */
export default async function SemPlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="rounded-card border-stroke-subtle bg-surface w-full max-w-md border p-6 shadow-[var(--shadow-8)]">
        <div className="mb-6 flex flex-col gap-1">
          <span className="text-brand text-xs font-semibold tracking-wide uppercase">
            Plano financeiro
          </span>
          <h1 className="text-xl font-semibold">Vamos criar seu plano</h1>
        </div>

        <p className="text-fg-muted mb-4 text-sm">
          Sua conta entrou, mas ainda não existe um plano ligado a ela. Criar leva um segundo — vem
          vazio, com algumas categorias de gasto para você começar.
        </p>
        <p className="text-fg-muted mb-6 text-sm">
          Depois é só preencher salário, contas e financiamento em <strong>Premissas</strong>. A
          projeção se refaz sozinha a cada número que você põe.
        </p>

        {erro ? (
          <p className="rounded-control bg-danger-bg text-danger mb-4 px-3 py-2 text-sm">
            Não consegui criar o plano agora. Tente de novo.
          </p>
        ) : null}

        <form action={createMyPlan}>
          <Button type="submit" variant="primary" size="touch" className="w-full">
            Criar meu plano
          </Button>
        </form>
      </div>
    </main>
  );
}
