import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { auth } from "@/infra/auth/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/resumo");

  const { error } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="rounded-card border-stroke-subtle bg-surface w-full max-w-sm border p-6 shadow-[var(--shadow-8)]">
        <div className="mb-6 flex flex-col gap-1">
          <span className="text-brand text-xs font-semibold tracking-wide uppercase">
            Plano financeiro
          </span>
          <h1 className="text-xl font-semibold">Entrar</h1>
          <p className="text-fg-muted text-sm">
            Acesso restrito à conta autorizada. Qualquer outra é recusada no login.
          </p>
        </div>

        {error ? (
          <p className="rounded-control bg-danger-bg text-danger mb-4 px-3 py-2 text-sm">
            Não foi possível entrar com essa conta.
          </p>
        ) : null}

        <form action={signInWithGoogle}>
          <Button type="submit" variant="primary" size="touch" className="w-full">
            Continuar com Google
          </Button>
        </form>
      </div>
    </main>
  );
}
