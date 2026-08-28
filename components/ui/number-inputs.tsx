"use client";

import * as React from "react";

import { Input } from "./field";

/** "1.234,56" → 1234.56. Aceita também "1234.56" digitado com ponto. */
export function parseDecimal(text: string): number {
  const normalized = text.trim().replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function formatDecimal(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Enquanto você digita, o campo mostra exatamente o que foi digitado; fora da
 * edição, mostra o número formatado.
 *
 * O rascunho existe para você poder digitar "1.2" sem o formatador brigar no
 * meio da digitação — e some no blur, que é quando o valor volta a ser a fonte
 * da verdade. Sem `useEffect`: o texto é derivado, não sincronizado.
 */
function useDraft(formatted: string) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return {
    text: draft ?? formatted,
    setDraft,
    commit: () => setDraft(null),
  };
}

/** Valor em reais. */
export function MoneyInput({
  value,
  onChange,
  id,
  ...props
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { text, setDraft, commit } = useDraft(formatDecimal(value));

  return (
    <Input
      {...props}
      id={id}
      inputMode="decimal"
      className="tabular"
      value={text}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parseDecimal(event.target.value);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      onBlur={commit}
    />
  );
}

/**
 * Percentual: você digita 7,66 e o domínio recebe 0.0766. Guardar decimal e
 * mostrar percentual evita a confusão clássica de "está em % ou em fração?".
 */
export function PercentInput({
  value,
  onChange,
  id,
  ...props
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { text, setDraft, commit } = useDraft(formatDecimal(value * 100));

  return (
    <div className="relative">
      <Input
        {...props}
        id={id}
        inputMode="decimal"
        className="tabular pr-8"
        value={text}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseDecimal(event.target.value);
          if (!Number.isNaN(parsed)) onChange(parsed / 100);
        }}
        onBlur={commit}
      />
      <span className="text-fg-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
        %
      </span>
    </div>
  );
}

export function IntegerInput({
  value,
  onChange,
  id,
  ...props
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Input
      {...props}
      id={id}
      type="number"
      className="tabular"
      value={String(value)}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed)) onChange(Math.trunc(parsed));
      }}
    />
  );
}
