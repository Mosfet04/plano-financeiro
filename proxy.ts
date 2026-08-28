import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/infra/auth/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Rotas abertas. Tudo que não estiver aqui exige sessão.
 *
 * `/api/cron` fica de fora da sessão de propósito: ela se autentica por Bearer
 * na própria rota, porque quem chama é o Vercel Cron (ou o Claude), não um
 * navegador com cookie.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/cron",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon",
  "/icons/",
];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (!request.auth) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/resumo", request.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
