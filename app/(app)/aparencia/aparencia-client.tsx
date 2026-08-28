"use client";

import { Check } from "lucide-react";
import { useTheme } from "next-themes";

import { ACCENTS, useAccent, type AccentName } from "@/components/theme/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Do sistema" },
] as const;

export function AparenciaClient() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  // `theme` só vale depois da hidratação: o servidor não sabe qual é a
  // preferência deste aparelho.
  const mounted = useHydrated();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "rounded-control flex h-11 items-center justify-center gap-2 border text-sm font-semibold transition-colors",
                mounted && theme === option.value
                  ? "border-brand bg-brand-tint text-[var(--brand-pressed)] dark:text-white"
                  : "border-stroke text-fg-muted hover:bg-surface-hover"
              )}
            >
              {mounted && theme === option.value ? <Check className="size-4" /> : null}
              {option.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cor de destaque</CardTitle>
          <p className="text-fg-muted text-xs">
            Fica gravada neste aparelho. Não muda nada no banco.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setAccent(name)}
              aria-label={`Cor ${name}`}
              aria-pressed={accent === name}
              className={cn(
                "grid size-12 place-items-center rounded-full border-2 transition-transform",
                accent === name ? "border-fg scale-110" : "border-transparent"
              )}
              style={{ background: ACCENTS[name].primary }}
            >
              {accent === name ? <Check className="size-5 text-white" /> : null}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
