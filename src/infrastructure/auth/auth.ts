import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";

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
     * Porta única do app: só e-mails da allowlist entram. Sem isso, qualquer
     * conta Google do planeta criaria usuário aqui — e o app tem os dados
     * financeiros de uma pessoa só.
     */
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return getEnv().ALLOWED_EMAILS.includes(email);
    },
  },
});
