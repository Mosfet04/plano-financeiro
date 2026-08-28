import { AlertTriangle, CalendarClock, PiggyBank } from "lucide-react";
import { notFound } from "next/navigation";

import { resolvePlanContext } from "@/app/actions/plan-context";
import { AmortizationAlert } from "@/components/resumo/amortization-alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { GoalStatus } from "@/core/domain/goal/goal.entity";
import { formatBRL } from "@/core/domain/shared/money";
import { formatMonth, monthOfISODate } from "@/core/domain/shared/month";

export const dynamic = "force-dynamic";

const percent = (value: number) =>
  `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export default async function ResumoPage() {
  const ctx = await resolvePlanContext();
  if (!ctx) notFound();

  const result = await ctx.container.useCases.getProjection.execute({ planId: ctx.planId });
  if (!result.ok) notFound();

  const { snapshot, projection } = result.value;
  const today = ctx.container.clock.today();
  const currentMonth = monthOfISODate(today);

  const nextMaturity = snapshot.investments
    .filter((investment) => investment.maturityDate >= today)
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))[0];

  const nextGoal = snapshot.goals
    .filter(
      (goal) =>
        goal.status === GoalStatus.PLANNED &&
        goal.targetMonth !== null &&
        goal.targetMonth >= currentMonth
    )
    .sort((a, b) => (a.targetMonth! < b.targetMonth! ? -1 : 1))[0];

  const hasHole = projection.minCash < 0;

  return (
    <div className="flex flex-col gap-4">
      {hasHole ? (
        <div className="rounded-card bg-danger-bg flex gap-3 border border-[var(--danger)] p-4">
          <AlertTriangle className="text-danger mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-danger text-sm font-semibold">
              O plano fica no vermelho em {formatMonth(projection.minCashMonth!)}
            </p>
            <p className="text-fg text-sm">
              Falta {formatBRL(Math.abs(projection.minCash) as typeof projection.minCash)} no caixa.
              Guardando{" "}
              <strong className="tabular">{formatBRL(projection.monthlyTopUpToFixHole)}</strong> a
              mais por mês até lá o buraco fecha — ou adie uma meta para outro mês.
            </p>
          </div>
        </div>
      ) : null}

      <AmortizationAlert advice={projection.amortizationAdvice} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sobra por mês hoje"
          value={formatBRL(projection.leftoverFirstMonth)}
          tone={projection.leftoverFirstMonth >= 0 ? "positive" : "negative"}
          hint="Antes da mudança. São os meses mais gordos do plano."
        />
        <Stat
          label="Sobra depois da mudança"
          value={formatBRL(projection.typicalLeftoverAfterMove)}
          tone={projection.typicalLeftoverAfterMove >= 0 ? "positive" : "negative"}
          hint="Mês típico com a parcela, sem metas nem 13º."
        />
        <Stat
          label="Apartamento quitado em"
          value={projection.payoffMonth ? formatMonth(projection.payoffMonth) : "—"}
          hint={
            projection.payoffMonth
              ? "Primeiro mês em que o caixa cobre o saldo devedor."
              : "O caixa não alcança o saldo devedor no horizonte projetado."
          }
        />
        <Stat
          label="Menor caixa do plano"
          value={formatBRL(projection.minCash)}
          tone={hasHole ? "negative" : "positive"}
          hint={
            projection.minCashMonth
              ? `Acontece em ${formatMonth(projection.minCashMonth)}.`
              : undefined
          }
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="text-brand size-4" />O que fazer agora
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {nextMaturity ? (
              <div className="border-brand flex flex-col gap-1 border-l-2 pl-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{nextMaturity.name}</span>
                  <span className="tabular text-sm">{formatBRL(nextMaturity.amount)}</span>
                </div>
                <span className="text-fg-muted text-xs">
                  Vence em{" "}
                  {new Date(`${nextMaturity.maturityDate}T12:00:00Z`).toLocaleDateString("pt-BR")}
                  {nextMaturity.instruction ? ` — ${nextMaturity.instruction}` : ""}
                </span>
              </div>
            ) : (
              <p className="text-fg-muted text-sm">Nenhuma aplicação a vencer.</p>
            )}

            {nextGoal ? (
              <div className="border-stroke flex flex-col gap-1 border-l-2 pl-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{nextGoal.name}</span>
                  <span className="tabular text-sm">{formatBRL(nextGoal.amount)}</span>
                </div>
                <span className="text-fg-muted text-xs">
                  Próxima meta, em {formatMonth(nextGoal.targetMonth!)}
                  {nextGoal.fundingSource ? ` — sai de: ${nextGoal.fundingSource}` : ""}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="text-brand size-4" />
              Premissas em vigor
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Rendimento líquido do caixa" value={percent(projection.netAnnualYield)} />
            <Row
              label="Custo de vida depois da mudança"
              value={formatBRL(projection.costOfLivingAfterMove)}
            />
            {snapshot.financing ? (
              <Row
                label="Juros do financiamento"
                value={`${percent(snapshot.financing.annualInterest)} a.a. · ${snapshot.financing.system}`}
              />
            ) : null}
            {snapshot.rates ? (
              <>
                <Row label="Selic" value={percent(snapshot.rates.selicAnnual)} />
                <Row label="CDI" value={percent(snapshot.rates.cdiAnnual)} />
                <Row label="IPCA (12 meses)" value={percent(snapshot.rates.ipcaAnnual)} />
                <div className="border-stroke-subtle mt-1 flex items-center gap-2 border-t pt-2">
                  <Badge tone="brand">{snapshot.rates.source}</Badge>
                  <span className="text-fg-muted text-xs">
                    Atualizado em {snapshot.rates.capturedAt.toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-fg-muted text-xs">
                Nenhum snapshot de taxas ainda. A rotina de quinta grava o primeiro.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-fg-muted">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}
