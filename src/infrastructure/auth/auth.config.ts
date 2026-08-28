import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Configuração compartilhada entre o middleware (edge) e o servidor (node).
 *
 * NÃO importe nada de Node aqui — nem o adapter do Drizzle, nem o cliente do
 * banco. Este módulo é empacotado no edge runtime do `proxy.ts`.
 */
export const authConfig = {
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
