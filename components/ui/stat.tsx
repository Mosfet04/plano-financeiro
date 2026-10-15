import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Bloco de número grande. O rótulo vem antes do valor porque o olho bate
 * primeiro no topo do card — e sem o rótulo o número não quer dizer nada.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "neutral" | "positive" | "negative";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border-stroke-subtle bg-surface flex flex-col gap-1 border p-4 shadow-[var(--shadow-2)]",
        className
      )}
    >
      <span className="text-fg-muted text-xs font-semibold">{label}</span>
      <span
        className={cn(
          // Em dois cards por linha num celular de 360px sobram ~128px para o
          // número. "R$ 12.345,67" em 24px não cabe, e o "-" quebrava sozinho
          // numa linha; aqui o tamanho desce com o comprimento e nunca quebra.
          "tabular leading-tight font-semibold whitespace-nowrap sm:text-2xl",
          value.length <= 12 ? "text-xl" : value.length <= 14 ? "text-lg" : "text-base",
          tone === "positive" && "text-success",
          tone === "negative" && "text-danger"
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-fg-muted text-xs leading-snug">{hint}</span> : null}
    </div>
  );
}
