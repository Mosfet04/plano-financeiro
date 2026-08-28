"use server";

import { signIn, signOut } from "@/infra/auth/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/resumo" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
