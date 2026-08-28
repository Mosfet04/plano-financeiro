export default function SemPlanoPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="rounded-card border-stroke-subtle bg-surface w-full max-w-md border p-6 shadow-[var(--shadow-4)]">
        <h1 className="mb-2 text-lg font-semibold">Nenhum plano cadastrado</h1>
        <p className="text-fg-muted mb-4 text-sm">
          Sua conta entrou, mas ainda não existe um plano no banco. Rode o seed para criar o plano
          inicial com os dados da planilha:
        </p>
        <pre className="rounded-control bg-surface-subtle overflow-x-auto p-3 font-mono text-xs">
          npm run db:seed
        </pre>
      </div>
    </main>
  );
}
