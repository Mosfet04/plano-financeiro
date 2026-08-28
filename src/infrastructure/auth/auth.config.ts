import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Configuração compartilhada entre o middleware (edge) e o servidor (node).
 *
 * NÃO importe nada de Node aqui — nem o adapter do Drizzle, nem o cliente do
 * banco. Este módulo é empacotado no edge runtime do `proxy.ts`.
 */
export const authConfig = {
  providers: [
    Google({
      /**
       * O seed cria a linha em `users` antes do primeiro login, para já
       * pendurar o plano nela. Sem isto, o adapter acha o usuário pelo e-mail,
       * não encontra nenhuma linha em `accounts` e recusa o login com
       * `OAuthAccountNotLinked`.
       *
       * O "dangerous" do nome é o cenário de vincular contas de provedores
       * diferentes pelo e-mail: alguém cadastra o seu endereço num provedor e
       * herda a sua conta quando você entra por outro. Aqui não existe esse
       * caminho — o Google é o único provedor, o e-mail vem verificado por ele,
       * e o callback `signIn` recusa qualquer endereço fora do ALLOWED_EMAILS.
       */
      allowDangerousEmailAccountLinking: true,
    }),
  ],
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
