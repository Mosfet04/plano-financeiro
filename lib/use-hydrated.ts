"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * `false` no servidor e na primeira renderização do cliente, `true` depois da
 * hidratação.
 *
 * Serve para preferências que só existem no aparelho (tema, cor de destaque):
 * o servidor não sabe qual é, então o primeiro HTML tem que ser neutro.
 * Usa `useSyncExternalStore` em vez de `useState` + `useEffect` para não
 * disparar uma renderização em cascata a cada montagem.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
