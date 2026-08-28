import { cn } from "@/lib/utils";

/**
 * Barra de orçado × gasto. Vira laranja perto do limite e vermelha quando
 * estoura — a cor é o aviso, não um texto que você vai ignorar.
 */
export function Meter({
  ratio,
  className,
  label,
}: {
  ratio: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const tone = ratio > 1 ? "bg-danger" : ratio >= 0.9 ? "bg-warning" : "bg-[var(--brand-primary)]";

  return (
    <div
      className={cn("bg-stroke-subtle h-1.5 w-full overflow-hidden rounded-full", className)}
      role="meter"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", tone)}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
