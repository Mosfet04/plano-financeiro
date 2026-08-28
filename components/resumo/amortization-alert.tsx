import { Landmark, TrendingUp } from "lucide-react";

import {
  AmortizationVerdict,
  type AmortizationAdvice,
} from "@/core/domain/projection/amortization-advice";
import { formatBRL } from "@/core/domain/shared/money";
import { cn } from "@/lib/utils";

const percent = (value: number) =>
  `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * A decisão que a queda da Selic vira do avesso: enquanto o caixa render mais
 * do que a dívida custa, adiantar parcela destrói valor. Quando inverte, cada
 * mês parado no CDI é dinheiro queimado.
 *
 * Só grita no veredito AMORTIZE. Nos outros dois é uma linha calma — um aviso
 * que aparece toda semana deixa de ser aviso.
 */
export function AmortizationAlert({ advice }: { advice: AmortizationAdvice | null }) {
  if (!advice) return null;

  if (advice.verdict === AmortizationVerdict.AMORTIZE) {
    return (
      <div className="rounded-card border border-[var(--warning)] bg-warning-bg p-4">
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="flex flex-col gap-2">
            <p className="text-base font-bold tracking-wide text-warning">
              VALE TIRAR DO CAIXA E AMORTIZAR
            </p>
            <p className="text-fg text-sm">
              O financiamento passou a custar{" "}
              <strong className="tabular">{percent(advice.debtAnnualCost)}</strong> ao ano,
              enquanto o caixa rende{" "}
              <strong className="tabular">{percent(advice.netAnnualYield)}</strong> líquidos.
              {advice.amountToAmortize > 0 ? (
                <>
                  {" "}
                  Deixar <strong className="tabular">
                    {formatBRL(advice.amountToAmortize)}
                  </strong>{" "}
                  aplicados custa cerca de{" "}
                  <strong className="tabular">{formatBRL(advice.annualDifference)}</strong> por
                  ano.
                </>
              ) : (
                " Ainda não há caixa de quitação para amortizar, mas a sobra dos próximos meses deve ir para a dívida em vez de render."
              )}
            </p>
            <Breakdown advice={advice} />
            {advice.amountToAmortize > 0 ? (
              <p className="text-fg-muted text-xs">
                O valor sai do caixa de quitação, nunca da reserva de emergência. Lance a
                amortização em Premissas → Financiamento para ver o efeito no prazo.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const borderline = advice.verdict === AmortizationVerdict.BORDERLINE;

  return (
    <div
      className={cn(
        "rounded-card border p-4",
        borderline ? "border-stroke bg-surface-subtle" : "border-stroke-subtle bg-surface"
      )}
    >
      <div className="flex items-start gap-3">
        <TrendingUp
          className={cn("mt-0.5 size-5 shrink-0", borderline ? "text-warning" : "text-success")}
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">
            {borderline
              ? "Amortizar e investir estão empatando"
              : "Continue investindo, não amortize"}
          </p>
          <p className="text-fg-muted text-sm">
            O caixa rende <strong className="tabular">{percent(advice.netAnnualYield)}</strong>{" "}
            líquidos e a dívida custa{" "}
            <strong className="tabular">{percent(advice.debtAnnualCost)}</strong> ao ano
            {borderline
              ? ". A diferença cabe na margem de erro — vale acompanhar a cada quinta."
              : `, uma folga de ${percent(advice.spread)}.`}
          </p>
          <Breakdown advice={advice} />
        </div>
      </div>
    </div>
  );
}

/** A conta aberta: sem ver a TR somada, o número do contrato engana. */
function Breakdown({ advice }: { advice: AmortizationAdvice }) {
  return (
    <p className="text-fg-muted text-xs">
      Custo da dívida ={" "}
      {percent(advice.debtAnnualCost - (advice.referenceRateAnnual ?? 0))} de juros do contrato
      {advice.referenceRateAnnual !== null
        ? ` + ${percent(advice.referenceRateAnnual)} de TR`
        : " (sem TR no último snapshot)"}
      .
    </p>
  );
}
