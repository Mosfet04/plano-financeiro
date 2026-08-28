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
          "tabular text-2xl leading-tight font-semibold",
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
