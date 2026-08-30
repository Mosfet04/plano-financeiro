import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";

import { buildContainer } from "@/composition/container";

import { getEnv } from "../config/env";
import { getDb } from "../db/client";
import { accounts, sessions, users, verificationTokens } from "../db/schema";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Porta única do app: só e-mails da allowlist entram. O app é para um
     * punhado de pessoas convidadas — sem isso, qualquer conta Google do
     * planeta criaria usuário e plano aqui.
     *
     * Convidar alguém é acrescentar o e-mail em `ALLOWED_EMAILS` e publicar.
     */
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return getEnv().ALLOWED_EMAILS.includes(email);
    },
  },
  events: {
    /**
     * Primeiro login de uma pessoa nova: o adapter acabou de criar a linha em
     * `users` e o plano vazio nasce junto. Sem isto, ela cairia direto na tela
     * de "sem plano" — que é onde o app parava quando existia um usuário só.
     *
     * O erro é engolido de propósito. Se a criação falhar aqui, o login ainda
     * vale e `/sem-plano` oferece o botão que refaz a mesma chamada; derrubar
     * a sessão inteira por causa disso seria pior.
     */
    async createUser({ user }) {
      if (!user.id) return;

      try {
        const result = await buildContainer().useCases.createPlan.execute({
          userId: user.id,
          ownerName: user.name,
        });
        if (!result.ok) {
          console.error("✗ plano inicial não criado:", result.error.message);
        }
      } catch (cause) {
        console.error("✗ plano inicial não criado:", cause);
      }
    },
  },
});
