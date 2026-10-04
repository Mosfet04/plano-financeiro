"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { decideSuggestion } from "@/app/actions/review.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SuggestionStatus } from "@/core/domain/review/plan-review.entity";

import type { SuggestionView } from "./review-format";

const STATUS_LABEL: Record<SuggestionStatus, { label: string; tone: "success" | "neutral" }> = {
  PENDING: { label: "Pendente", tone: "neutral" },
  APPLIED: { label: "Aplicada", tone: "success" },
  DISMISSED: { label: "Recusada", tone: "neutral" },
  SUPERSEDED: { label: "Substituída", tone: "neutral" },
};

/**
 * A revisão mensal da rotina do Claude. Nada aqui foi aplicado: cada sugestão
 * espera você, com o impacto que o motor mediu.
 */
export function ReviewCard({
  title,
  createdAt,
  summary,
  suggestions,
}: {
  title: string;
  createdAt: string;
  summary: string;
  suggestions: readonly SuggestionView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function decide(suggestion: SuggestionView, accept: boolean) {
    startTransition(async () => {
      const result = await decideSuggestion({ id: suggestion.id, accept });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(accept ? "Aplicada. O plano já foi refeito." : "Recusada.");
      router.refresh();
    });
  }

  const open = suggestions.filter((s) => s.status === SuggestionStatus.PENDING);
  const decided = suggestions.filter((s) => s.status !== SuggestionStatus.PENDING);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-brand size-4" />
          {title}
        </CardTitle>
        <p className="text-fg-muted text-xs">
          Feita pela rotina do Claude em {new Date(createdAt).toLocaleDateString("pt-BR")}. Nada
          muda até você aplicar.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm">
          {summary.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>

        {open.map((suggestion) => (
          <div key={suggestion.id} className="border-brand flex flex-col gap-2 border-l-2 pl-3">
            <span className="text-sm font-semibold">{suggestion.title}</span>
            {suggestion.change ? (
              <span className="tabular text-sm">{suggestion.change}</span>
            ) : null}
            <p className="text-fg-muted text-sm">{suggestion.rationale}</p>
            {suggestion.impact.length > 0 ? (
              <ul className="text-fg-muted tabular flex flex-col text-xs">
                {suggestion.impact.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => decide(suggestion, true)}
              >
                {suggestion.change ? "Aplicar" : "Feito"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                disabled={pending}
                onClick={() => decide(suggestion, false)}
              >
                {suggestion.change ? "Recusar" : "Ignorar"}
              </Button>
            </div>
          </div>
        ))}

        {decided.length > 0 ? (
          <div className="border-stroke-subtle flex flex-col gap-1.5 border-t pt-3">
            {decided.map((suggestion) => (
              <div key={suggestion.id} className="flex items-center justify-between gap-2">
                <span className="text-fg-muted truncate text-xs">{suggestion.title}</span>
                <Badge tone={STATUS_LABEL[suggestion.status].tone}>
                  {STATUS_LABEL[suggestion.status].label}
                </Badge>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
