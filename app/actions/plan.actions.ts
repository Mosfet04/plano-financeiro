"use server";

import { redirect } from "next/navigation";

import { buildContainer } from "@/composition/container";
import { auth } from "@/infra/auth/auth";

/**
 * Rede de segurança do primeiro login.
 *
 * O caminho normal é o evento `createUser` do Auth.js, que cria o plano vazio
 * assim que a pessoa entra pela primeira vez. Esta action existe para os dois
 * casos em que ele não roda: o usuário que veio do seed (a linha em `users` já
 * existia, então não houve `createUser`) e a falha esporádica de banco no meio
 * do login.
 *
 * O caso de uso é idempotente: quem já tem plano só é redirecionado.
 *
 * Sai por `redirect` nos dois caminhos porque é action de `<form>`, que só
 * aceita retorno vazio — o erro volta pela query string da própria tela.
 */
export async function createMyPlan() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const result = await buildContainer().useCases.createPlan.execute({
    userId,
    ownerName: session.user.name,
  });

  if (!result.ok) redirect("/sem-plano?erro=1");

  // Premissas é onde o plano vazio vira o plano da pessoa: salário, moradia,
  // financiamento. Sem essa parada, /resumo mostraria só zeros.
  redirect("/premissas");
}
