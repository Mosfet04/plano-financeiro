"use client";

import { ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { previewTurnover, settleMonth } from "@/app/actions/closing.actions";
import { resolveGoalAtTurnover } from "@/app/actions/goal.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { formatDecimal, MoneyInput, parseDecimal } from "@/components/ui/number-inputs";
import type { SettlementPreview } from "@/core/application/use-cases/settle-month.use-case";
import { formatBRL, type Cents } from "@/core/domain/shared/money";
import {
  addMonths,
  dayOfISODate,
  endOfMonthDate,
  formatMonth,
  monthOfISODate,
  type YearMonth,
} from "@/core/domain/shared/month";
import { cn } from "@/lib/utils";

export interface ViradaData {
  month: YearMonth;
  /** Data em que os saldos ficam conferidos: hoje. */
  checkedOn: string;
  /** O mês já estava fechado — esta é uma virada refeita. */
  isRedo: boolean;
  note: string;
  summary: {
    income: number;
    housing: number;
    otherFixed: number;
    extraIncome: number;
    variableSpent: number;
    goalSpent: number;
    goalCommitted: number;
    mealCardOverflow: number;
    leftover: number;
    planTarget: number;
    transactionCount: number;
  };
  /** Metas do mês ainda planejadas com valor por lançar. */
  pendingGoals: Array<{
    id: string;
    name: string;
    amount: number;
    launched: number;
    remaining: number;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    balance: number;
    checkedOn: string;
    estimatedYield: number;
    expected: number;
  }>;
  matured: Array<{ id: string; name: string; amount: number; maturityDate: string }>;
  fgts: { balance: number } | null;
}

const money = (value: number) => formatBRL(value as Cents);
const toCents = (reais: number) => Math.round(reais * 100);
const date = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/** Diferença entre o guardado e a sobra que ainda conta como "bate". */
const TOLERANCE_CENTS = 5_000;

const STEPS = ["Revisar o mês", "Conferir as caixinhas", "Confirmar"] as const;

/**
 * A virada em três passos: ver como o mês foi, conferir cada caixinha no app
 * do banco, e ver o que muda no plano antes de gravar. Nada é gravado antes do
 * último botão — e quando grava, grava tudo junto.
 */
export function ViradaClient({ data }: { data: ViradaData }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [pending, setPending] = React.useState(false);

  // Saldos em reais, vazios de propósito: o ponto é olhar o app do banco, não
  // aceitar um número que o próprio plano sugeriu.
  const [balances, setBalances] = React.useState<Record<string, number | null>>(() =>
    Object.fromEntries(data.accounts.map((account) => [account.id, null]))
  );
  const [redeemed, setRedeemed] = React.useState<Set<string>>(
    () => new Set(data.matured.map((investment) => investment.id))
  );
  const [fgts, setFgts] = React.useState(data.fgts ? data.fgts.balance / 100 : 0);
  const [note, setNote] = React.useState(data.note);
  const [preview, setPreview] = React.useState<SettlementPreview | null>(null);

  const allConferred = data.accounts.every((account) => balances[account.id] !== null);

  function payload() {
    return {
      month: data.month,
      balances: data.accounts.map((account) => ({
        accountId: account.id,
        balance: balances[account.id] ?? 0,
      })),
      redeemedInvestmentIds: [...redeemed],
      fgtsBalance: data.fgts ? fgts : null,
      note: note.trim() || null,
    };
  }

  async function goToConfirm() {
    setPending(true);
    const result = await previewTurnover(payload());
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPreview(result.value);
    setStep(2);
  }

  async function confirm() {
    setPending(true);
    const result = await settleMonth(payload());
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Virada feita: ${formatMonth(data.month)} está fechado.`);
    router.push(`/mes?mes=${data.month}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {data.isRedo ? "Refazer a virada de " : "Virada de "}
          {formatMonth(data.month)}
        </h2>
        <ol className="text-fg-muted flex flex-wrap items-center gap-1 text-xs">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-1">
              {index > 0 ? <ArrowRight className="size-3" /> : null}
              <span className={cn(index === step && "text-brand font-semibold")}>
                {index + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
      </header>

      {step === 0 ? <ReviewStep data={data} onNext={() => setStep(1)} /> : null}

      {step === 1 ? (
        <>
          <ConferStep
            data={data}
            balances={balances}
            onBalance={(id, value) => setBalances((current) => ({ ...current, [id]: value }))}
            redeemed={redeemed}
            onRedeemed={(id, checked) =>
              setRedeemed((current) => {
                const next = new Set(current);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            fgts={fgts}
            onFgts={setFgts}
            note={note}
            onNote={setNote}
          />
          <div className="flex gap-2">
            <Button variant="subtle" size="touch" onClick={() => setStep(0)}>
              Voltar
            </Button>
            <Button
              variant="primary"
              size="touch"
              className="flex-1"
              disabled={!allConferred || pending}
              onClick={goToConfirm}
            >
              {pending
                ? "Calculando…"
                : allConferred
                  ? "Ver o efeito no plano"
                  : "Confira todas as contas para seguir"}
            </Button>
          </div>
        </>
      ) : null}

      {step === 2 && preview ? (
        <>
          <ConfirmStep
            data={data}
            preview={preview}
            redeemedCount={redeemed.size}
            fgts={data.fgts && toCents(fgts) !== data.fgts.balance ? toCents(fgts) : null}
          />
          <div className="flex gap-2">
            <Button variant="subtle" size="touch" disabled={pending} onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button
              variant="primary"
              size="touch"
              className="flex-1"
              disabled={pending}
              onClick={confirm}
            >
              {pending ? "Gravando…" : `Fechar ${formatMonth(data.month)}`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReviewStep({ data, onNext }: { data: ViradaData; onNext: () => void }) {
  const { summary } = data;
  const slack = summary.leftover - summary.planTarget;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Como foi {formatMonth(data.month)}</CardTitle>
          <p className="text-fg-muted text-xs">
            {summary.transactionCount} lançamento(s). Faltou algum gasto ou entrada? Lance antes de
            seguir: na virada o número congela.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <Line label="Renda do mês" value={summary.income} />
          {summary.extraIncome > 0 ? (
            <Line label="Renda extra" value={summary.extraIncome} />
          ) : null}
          <Line label="Moradia e parcela" value={-summary.housing} />
          <Line label="Contas fixas" value={-summary.otherFixed} />
          <Line label="Gastos variáveis" value={-summary.variableSpent} />
          {summary.goalCommitted > 0 ? <Line label="Metas" value={-summary.goalCommitted} /> : null}
          {summary.mealCardOverflow > 0 ? (
            <Line label="Estourou o VA" value={-summary.mealCardOverflow} />
          ) : null}
          <div className="border-stroke-subtle mt-1 flex flex-col gap-1.5 border-t pt-2">
            <Line label="Sobrou" value={summary.leftover} strong />
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-fg-muted">Meta do plano</span>
              <span className="flex items-center gap-2">
                <span className="tabular font-semibold">{money(summary.planTarget)}</span>
                <Badge tone={slack >= 0 ? "success" : "danger"}>
                  {slack >= 0 ? "+" : ""}
                  {money(slack)}
                </Badge>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.pendingGoals.length > 0 ? <PendingGoalsCard data={data} /> : null}

      <p className="text-fg-muted text-xs">
        A sobra não vai sozinha para as caixinhas: é você quem transfere. O próximo passo confere se
        ela chegou lá.
      </p>

      <div className="flex gap-2">
        <Link
          href={`/mes?mes=${data.month}`}
          className="rounded-control text-fg hover:bg-surface-hover inline-flex h-11 items-center px-4 text-sm font-semibold"
        >
          Ver lançamentos
        </Link>
        <Button variant="primary" size="touch" className="flex-1" onClick={onNext}>
          Continuar
        </Button>
      </div>
    </>
  );
}

/**
 * Meta do mês que não foi paga inteira. Sem resposta, a sobra conta o previsto
 * como saído — o que deixa a conferência das caixinhas sem bater quando o
 * dinheiro ficou lá.
 */
function PendingGoalsCard({ data }: { data: ViradaData }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const next = formatMonth(addMonths(data.month, 1));

  async function resolve(goalId: string, resolution: "DONE" | "CARRY") {
    setBusy(goalId);
    const result = await resolveGoalAtTurnover({ goalId, month: data.month, resolution });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas que não saíram inteiras</CardTitle>
        <p className="text-fg-muted text-xs">
          A sobra acima conta o previsto como já pago. Diga o que aconteceu antes de conferir as
          caixinhas.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {data.pendingGoals.map((goal) => (
          <div key={goal.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold">{goal.name}</span>
              <span className="text-fg-muted tabular text-xs">
                {money(goal.launched)} de {money(goal.amount)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => resolve(goal.id, "DONE")}
              >
                {goal.launched > 0 ? `Concluída por ${money(goal.launched)}` : "Concluída"}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                disabled={busy !== null}
                onClick={() => resolve(goal.id, "CARRY")}
              >
                {money(goal.remaining)} fica para {next}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConferStep({
  data,
  balances,
  onBalance,
  redeemed,
  onRedeemed,
  fgts,
  onFgts,
  note,
  onNote,
}: {
  data: ViradaData;
  balances: Record<string, number | null>;
  onBalance: (id: string, value: number | null) => void;
  redeemed: Set<string>;
  onRedeemed: (id: string, checked: boolean) => void;
  fgts: number;
  onFgts: (value: number) => void;
  note: string;
  onNote: (value: string) => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Saldos de hoje</CardTitle>
          <p className="text-fg-muted text-xs">
            Abra o app de cada banco e digite o saldo de agora, de todas as contas — mesmo as que
            não receberam nada, porque renderam. O esperado é o saldo anterior mais o rendimento; a
            sobra que você guardou vem por cima.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.accounts.map((account) => {
            const value = balances[account.id];
            const change = value === null ? null : toCents(value) - account.balance;
            return (
              <div
                key={account.id}
                className="border-stroke-subtle flex flex-col gap-1.5 border-b pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{account.name}</span>
                  {change !== null ? (
                    <span
                      className={cn(
                        "tabular text-xs font-semibold",
                        change >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {change >= 0 ? "+" : ""}
                      {money(change)}
                    </span>
                  ) : null}
                </div>
                <span className="text-fg-muted text-xs">
                  Antes: {money(account.balance)} em {date(account.checkedOn)} · rendeu ~
                  {money(account.estimatedYield)}
                </span>
                <BalanceInput
                  value={value}
                  onChange={(next) => onBalance(account.id, next)}
                  placeholder={`Esperado ${formatDecimal(account.expected / 100)} + o que você guardou`}
                  aria-label={`Saldo de ${account.name} agora`}
                />
                {value === null ? (
                  <button
                    type="button"
                    className="text-brand self-start text-xs font-semibold hover:underline"
                    onClick={() => onBalance(account.id, account.expected / 100)}
                  >
                    Não guardei nada aqui — usar o esperado ({money(account.expected)})
                  </button>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {data.matured.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Aplicações que venceram</CardTitle>
            <p className="text-fg-muted text-xs">
              O dinheiro delas tem que estar numa das contas acima. Se caiu na conta corrente,
              transfira antes de conferir — o plano não enxerga a conta corrente.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.matured.map((investment) => (
              <label key={investment.id} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--brand-primary)]"
                  checked={redeemed.has(investment.id)}
                  onChange={(event) => onRedeemed(investment.id, event.target.checked)}
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{investment.name}</span>
                    <span className="tabular">{money(investment.amount)}</span>
                  </span>
                  <span className="text-fg-muted text-xs">
                    Venceu em {date(investment.maturityDate)}.{" "}
                    {redeemed.has(investment.id)
                      ? "Já está numa caixinha: sai da lista de aplicações."
                      : "Fica na lista. Se você reaplicou, atualize o vencimento em Premissas → Aplicações."}
                  </span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.fgts ? (
        <Card>
          <CardHeader>
            <CardTitle>FGTS</CardTitle>
          </CardHeader>
          <CardContent>
            <Field
              label="Saldo no app FGTS"
              hint="O plano projeta os próximos depósitos a partir dele. Sem atualizar, cada mês fechado perde um depósito."
            >
              <MoneyInput value={fgts} onChange={onFgts} />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Reconciliation data={data} balances={balances} redeemed={redeemed} />

      <Field label="Observação (opcional)" hint="Fica guardada junto do fechamento.">
        <Textarea
          value={note}
          maxLength={300}
          placeholder="Ex.: R$ 700 ficaram na conta corrente para as contas de outubro."
          onChange={(event) => onNote(event.target.value)}
        />
      </Field>
    </>
  );
}

/**
 * A conferência que o fechamento nunca teve: o que entrou nas caixinhas, tirado
 * o rendimento e as aplicações que caíram nelas, deveria ser a sobra do mês.
 * Quando não é, ou faltou lançamento, ou o dinheiro ficou na conta corrente.
 */
function Reconciliation({
  data,
  balances,
  redeemed,
}: {
  data: ViradaData;
  balances: Record<string, number | null>;
  redeemed: Set<string>;
}) {
  if (data.accounts.some((account) => balances[account.id] === null)) return null;

  const before = data.accounts.reduce((sum, account) => sum + account.balance, 0);
  const after = data.accounts.reduce((sum, account) => sum + toCents(balances[account.id]!), 0);
  const yieldTotal = data.accounts.reduce((sum, account) => sum + account.estimatedYield, 0);
  const fromInvestments = data.matured
    .filter((investment) => redeemed.has(investment.id))
    .reduce((sum, investment) => sum + investment.amount, 0);

  const saved = after - before - yieldTotal - fromInvestments;
  const diff = saved - data.summary.leftover;

  // A comparação é tão boa quanto o saldo anterior. Conferido no meio do mês,
  // ele já tinha parte do mês dentro (ou faltando), e a diferença pode ser só isso.
  const midMonthBaseline = data.accounts.some((account) => {
    const day = dayOfISODate(account.checkedOn);
    return day !== 1 && account.checkedOn !== endOfMonthDate(monthOfISODate(account.checkedOn));
  });

  const tone = Math.abs(diff) <= TOLERANCE_CENTS ? "ok" : diff < 0 ? "short" : "over";

  return (
    <Card>
      <CardHeader>
        <CardTitle>A sobra chegou nas caixinhas?</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        <Line label="Caixinhas antes" value={before} />
        <Line label="Caixinhas agora" value={after} />
        <Line label="Rendimento estimado" value={-yieldTotal} />
        {fromInvestments > 0 ? (
          <Line label="Aplicações que caíram nelas" value={-fromInvestments} />
        ) : null}
        <div className="border-stroke-subtle mt-1 flex flex-col gap-1.5 border-t pt-2">
          <Line label="Você guardou" value={saved} strong />
          <Line label={`Sobra de ${formatMonth(data.month)}`} value={data.summary.leftover} />
        </div>

        <div
          className={cn(
            "rounded-control mt-2 flex gap-2 p-3 text-xs",
            tone === "ok" && "bg-success-bg",
            tone === "short" && "bg-warning-bg",
            tone === "over" && "bg-surface-subtle"
          )}
        >
          {tone === "ok" ? (
            <CheckCircle2 className="text-success size-4 shrink-0" />
          ) : tone === "short" ? (
            <TriangleAlert className="text-warning size-4 shrink-0" />
          ) : (
            <Info className="text-fg-muted size-4 shrink-0" />
          )}
          <p>
            {tone === "ok"
              ? "Bate com a sobra do mês."
              : tone === "short"
                ? `${money(-diff)} da sobra não chegou nas caixinhas. Ficou na conta corrente, ou falta algum lançamento? O que fica na conta corrente o plano não enxerga.`
                : `Entrou ${money(diff)} a mais do que a sobra. Falta lançar alguma renda extra, ou o rendimento foi maior que o estimado?`}
            {midMonthBaseline && tone !== "ok"
              ? " A conta é aproximada: algum saldo anterior foi conferido no meio do mês, e já tinha parte dele dentro."
              : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmStep({
  data,
  preview,
  redeemedCount,
  fgts,
}: {
  data: ViradaData;
  preview: SettlementPreview;
  redeemedCount: number;
  fgts: number | null;
}) {
  const { before, after } = preview;
  const monthOrDash = (month: YearMonth | null) => (month ? formatMonth(month) : "—");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>O que muda no plano</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Change
            label="Caixa"
            before={money(before.openingCash)}
            after={money(after.openingCash)}
          />
          <Change
            label="Projeção a partir de"
            before={formatMonth(before.startMonth)}
            after={formatMonth(after.startMonth)}
          />
          <Change
            label="Menor caixa"
            before={`${money(before.minCash)} (${monthOrDash(before.minCashMonth)})`}
            after={`${money(after.minCash)} (${monthOrDash(after.minCashMonth)})`}
            tone={
              after.minCash > before.minCash ? "up" : after.minCash < before.minCash ? "down" : null
            }
          />
          <Change
            label="Quitação"
            before={monthOrDash(before.payoffMonth)}
            after={monthOrDash(after.payoffMonth)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>O que vai ser gravado</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-fg-muted flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>
              {data.accounts.length} conta(s) conferida(s) em {date(data.checkedOn)}.
            </li>
            <li>
              {formatMonth(data.month)} fecha com sobra de {money(data.summary.leftover)} contra
              meta de {money(data.summary.planTarget)}.
            </li>
            {redeemedCount > 0 ? (
              <li>{redeemedCount} aplicação(ões) vencida(s) sai(em) da lista.</li>
            ) : null}
            {fgts !== null ? <li>FGTS atualizado para {money(fgts)}.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function Change({
  label,
  before,
  after,
  tone = null,
}: {
  label: string;
  before: string;
  after: string;
  tone?: "up" | "down" | null;
}) {
  const changed = before !== after;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className="text-fg-muted">{label}</span>
      <span className="tabular flex items-baseline gap-1.5 text-right">
        {changed ? (
          <>
            <span className="text-fg-muted">{before}</span>
            <ArrowRight className="text-fg-muted size-3 self-center" />
          </>
        ) : null}
        <span
          className={cn(
            "font-semibold",
            tone === "up" && "text-success",
            tone === "down" && "text-danger"
          )}
        >
          {after}
        </span>
      </span>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn(strong ? "font-semibold" : "text-fg-muted")}>{label}</span>
      <span
        className={cn(
          "tabular font-semibold",
          strong && (value >= 0 ? "text-success" : "text-danger")
        )}
      >
        {money(value)}
      </span>
    </div>
  );
}

/**
 * Saldo que começa vazio. O `MoneyInput` sempre mostra um número, e aqui o
 * vazio significa "ainda não conferi" — é o que segura o botão de seguir.
 */
function BalanceInput({
  value,
  onChange,
  ...props
}: {
  value: number | null;
  onChange: (value: number | null) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const text = draft ?? (value === null ? "" : formatDecimal(value));

  return (
    <Input
      {...props}
      inputMode="decimal"
      className="tabular"
      value={text}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value.trim() === "") {
          onChange(null);
          return;
        }
        const parsed = parseDecimal(event.target.value);
        if (!Number.isNaN(parsed) && parsed >= 0) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
