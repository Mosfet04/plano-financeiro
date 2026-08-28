"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

/** Cores de destaque disponíveis — as mesmas do conjunto de acentos do Fluent. */
export const ACCENTS = {
  roxo: { primary: "#5b5fc7", hover: "#4f52b2", pressed: "#444791", tint: "#e8ebfa" },
  azul: { primary: "#0f6cbd", hover: "#115ea3", pressed: "#0c3b5e", tint: "#e5eff9" },
  verde: { primary: "#0e700e", hover: "#0c5e0c", pressed: "#094509", tint: "#e7f5e7" },
  teal: { primary: "#00807a", hover: "#006b66", pressed: "#00514d", tint: "#e0f2f1" },
  vinho: { primary: "#a4262c", hover: "#8b2025", pressed: "#6b181c", tint: "#fbeaea" },
} as const;

export type AccentName = keyof typeof ACCENTS;

const STORAGE_KEY = "plano-financeiro:accent";
const DEFAULT_ACCENT: AccentName = "roxo";

/**
 * `localStorage` é um sistema externo ao React, então o acesso passa por
 * `useSyncExternalStore` — nada de ler no efeito e chamar setState, que
 * renderiza duas vezes toda montagem.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // `storage` cobre a troca feita em outra aba.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readAccent(): AccentName {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored in ACCENTS ? (stored as AccentName) : DEFAULT_ACCENT;
}

function writeAccent(accent: AccentName) {
  window.localStorage.setItem(STORAGE_KEY, accent);
  listeners.forEach((listener) => listener());
}

function applyAccent(accent: AccentName) {
  const palette = ACCENTS[accent];
  const root = document.documentElement.style;
  root.setProperty("--brand-primary", palette.primary);
  root.setProperty("--brand-hover", palette.hover);
  root.setProperty("--brand-pressed", palette.pressed);
  root.setProperty("--brand-tint", palette.tint);
}

const AccentContext = React.createContext<{
  accent: AccentName;
  setAccent: (accent: AccentName) => void;
}>({ accent: DEFAULT_ACCENT, setAccent: () => {} });

export function useAccent() {
  return React.useContext(AccentContext);
}

/** Tema (claro/escuro/sistema) e cor de destaque. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const accent = React.useSyncExternalStore(subscribe, readAccent, () => DEFAULT_ACCENT);

  // Escrever variável CSS no <html> é justamente o caso de uso de um efeito:
  // sincronizar o DOM com o estado. Não chama setState.
  React.useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  const value = React.useMemo(() => ({ accent, setAccent: writeAccent }), [accent]);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
    </NextThemesProvider>
  );
}
