"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Lixeira de dois toques. No celular a rolagem passa o dedo por cima da lista
 * o tempo todo, e um toque errado apagava na hora, sem volta. O primeiro toque
 * arma ("Apagar?"), o segundo apaga; sem o segundo em 3s, ou tocando fora, ela
 * desarma sozinha.
 */
export function ConfirmDeleteButton({
  label,
  onConfirm,
  disabled,
}: {
  /** "Apagar Mercado" — vira o nome acessível do botão. */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      aria-label={armed ? `Confirmar: ${label}` : label}
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onBlur={() => setArmed(false)}
      className={cn(
        "rounded-control grid h-11 min-w-11 shrink-0 place-items-center transition-colors disabled:opacity-40 md:h-9 md:min-w-9",
        armed
          ? "bg-danger px-3 text-xs font-semibold text-white"
          : "text-fg-muted hover:bg-danger-bg hover:text-danger active:bg-danger-bg"
      )}
    >
      {armed ? "Apagar?" : <Trash2 className="size-4" />}
    </button>
  );
}
