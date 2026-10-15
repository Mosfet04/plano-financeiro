"use client";

import {
  AlertTriangle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
  Undo2,
  Watch,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { reopenMonth } from "@/app/actions/closing.actions";
import { deleteTransaction, setTransactionPaymentMethod } from "@/app/actions/transaction.actions";
import { TurnoverBanner } from "@/components/mes/turnover-banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { Meter } from "@/components/ui/meter";
import { Stat } from "@/components/ui/stat";
import { formatBRL, type Cents } from "@/core/domain/shared/money";
import { formatMonth, type YearMonth } from "@/core/domain/shared/month";
import { cn } from "@/lib/utils";

export interface MesData {
  month: YearMonth;
  /** Nulo antes do início do plano. */
  previousMonth: YearMonth | null;
  /** Nulo no mês corrente: o futuro ainda não tem lançamento. */
  nextMonth: YearMonth | null;
  /** Último dia do mês, "YYYY-MM-DD" — quando a virada abre. */
  lastDay: string;
  /** Virada pendente de OUTRO mês, para o aviso do topo. */
  pendingTurnover: YearMonth | null;
  today: string;
  /** Preenchido quando o mês já foi fechado — os números congelados. */
  settled: {
    leftover: number;
    planTarget: number;
    cash: number;
    closedAt: string;
  } | null;
  /** O mês já acabou (ou hoje é o último dia dele): a virada está aberta. */
  isOver: boolean;
  /** Fechar sem nenhuma conta de caixa apaga do plano o dinheiro já guardado. */
  hasCashAccounts: boolean;
  /** Série "o plano previu × eu fiz", do mais recente para trás. */
  history: Array<{ month: string; leftover: number; planTarget: number; cash: number }>;
  categories: Array<{
    id: string;
    name: string;
    budget: number;
    spent: number;
    remaining: number;
    usedRatio: number;
  }>;
  fixedBills: Array<{ id: string; name: string; amount: number; dueDay: number | null }>;
  fixedTotal: number;
  mealCardCredited: number;
  mealCardSpent: number;
  mealCardRemaining: number;
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
  savingsBoost: number;
  onPlan: boolean;
  slack: number;
  allowance: Record<"cash" | "mealCard", Allowance>;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    kind: string;
    categoryName: string | null;
    paymentMethod: string;
    fromWatch: boolean;
    amount: number;
  }>;
}

interface Allowance {
  daysLeft: number;
  dayBudget: number;
  remainingToday: number;
  monthRemaining: number;
}

const money = (value: number) => formatBRL(value as Cents);

const SOURCE_LABELS = { CASH: "Dinheiro", MEAL_CARD: "VA" } as const;

export function MesClient({ data }: { data: MesData }) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleDelete(id: string) {
    setPendingId(id);
    const result = await deleteTransaction({ id });
    setPendingId(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Lançamento apagado.");
    router.refresh();
  }

  async function handleToggleSource(transaction: MesData["transactions"][number]) {
    setPendingId(transaction.id);
    const result = await setTransactionPaymentMethod({
      id: transaction.id,
      paymentMethod: transaction.paymentMethod === "MEAL_CARD" ? "CASH" : "MEAL_CARD",
    });
    setPendingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {data.pendingTurnover ? (
        <TurnoverBanner month={data.pendingTurnover} today={data.today} />
      ) : null}

      <MonthNav data={data} />
      <SettleBar data={data} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sobrou no mês"
          value={money(data.leftover)}
          tone={data.leftover >= 0 ? "positive" : "negative"}
          hint={
            data.savingsBoost > 0
              ? `Meta do plano: ${money(data.planTarget)}, com ${money(data.savingsBoost)} de reforço`
              : `Meta do plano: ${money(data.planTarget)}`
          }
        />
        <Stat
          label={data.onPlan ? "No plano" : "Abaixo do plano"}
          value={money(data.slack)}
          tone={data.onPlan ? "positive" : "negative"}
          hint={
            data.onPlan
              ? "Folga acima da meta do mês."
              : "Alguma categoria estourou — veja quais abaixo."
          }
        />
        {data.nextMonth === null ? (
          <>
            <TodayStat label="Hoje · Dinheiro" allowance={data.allowance.cash} />
            <TodayStat label="Hoje · VA" allowance={data.allowance.mealCard} />
          </>
        ) : (
          // Mês que já passou não tem "hoje" — o que interessa é quanto saiu.
          <>
            <Stat
              label="Gasto em dinheiro"
              value={money(data.variableSpent)}
              hint="Gastos variáveis, fora o VA."
            />
            <Stat
              label="Sobrou no VA"
              value={money(data.mealCardRemaining)}
              tone={data.mealCardRemaining >= 0 ? "positive" : "negative"}
            />
          </>
        )}
      </section>

      {/* `grid-cols-1` e não o padrão: a coluna implícita cresce até o texto
          mais largo sem quebra (os nomes truncados), e no celular o card
          passava da borda direita da tela. */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onde você pode gastar</CardTitle>
            <p className="text-fg-muted text-xs">
              Só gasto em dinheiro consome o orçamento. O VA tem controle próprio.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.categories.map((category) => (
              <div key={category.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{category.name}</span>
                  <span
                    className={cn(
                      "tabular shrink-0",
                      category.remaining < 0 ? "text-danger" : "text-fg-muted"
                    )}
                  >
                    {money(category.spent)} / {money(category.budget)}
                  </span>
                </div>
                <Meter ratio={category.usedRatio} label={category.name} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Fechamento</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <Line label="Renda do mês" value={data.income} />
              {data.extraIncome > 0 ? <Line label="Renda extra" value={data.extraIncome} /> : null}
              <Line label="Moradia e parcela" value={-data.housing} />
              <Line label="Contas fixas" value={-data.otherFixed} />
              <Line label="Gastos variáveis" value={-data.variableSpent} />
              {data.goalCommitted > 0 ? (
                <>
                  <Line label="Metas" value={-data.goalCommitted} />
                  {data.goalCommitted > data.goalSpent ? (
                    // O previsto ainda não pago já sai da sobra: é dinheiro comprometido.
                    <p className="text-fg-muted -mt-1 text-right text-xs">
                      {money(data.goalSpent)} lançado · {money(data.goalCommitted - data.goalSpent)}{" "}
                      ainda a pagar
                    </p>
                  ) : null}
                </>
              ) : null}
              {data.mealCardOverflow > 0 ? (
                <Line label="Estourou o VA" value={-data.mealCardOverflow} />
              ) : null}
              <div className="border-stroke-subtle mt-1 border-t pt-2">
                <Line label="Sobrou" value={data.leftover} strong />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contas fixas do mês</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {data.fixedBills.map((bill) => (
                <div key={bill.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-fg-muted truncate">
                    {bill.name}
                    {bill.dueDay ? ` · dia ${bill.dueDay}` : ""}
                  </span>
                  <span className="tabular shrink-0 font-semibold">{money(bill.amount)}</span>
                </div>
              ))}
              <div className="border-stroke-subtle mt-1 border-t pt-2">
                <Line label="Total" value={data.fixedTotal} strong />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos de {formatMonth(data.month)}</CardTitle>
          <p className="text-fg-muted text-xs">{data.transactions.length} lançamento(s).</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 px-2">
          {data.transactions.length === 0 ? (
            <p className="text-fg-muted px-2 py-6 text-center text-sm">
              Nada lançado ainda. Use o botão <strong>+</strong> para registrar o primeiro gasto.
            </p>
          ) : (
            data.transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="rounded-control hover:bg-surface-hover flex items-center gap-3 px-2 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{transaction.description}</span>
                  <span className="text-fg-muted flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                    {new Date(`${transaction.date}T12:00:00Z`).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                    {transaction.categoryName ? ` · ${transaction.categoryName}` : null}
                    {transaction.kind === "EXPENSE" ? (
                      <button
                        type="button"
                        title="Trocar a fonte"
                        onClick={() => handleToggleSource(transaction)}
                        disabled={pendingId === transaction.id}
                        // O selo tem 20px de altura; a área invisível em volta
                        // leva o toque para perto dos 44px sem mexer no layout.
                        className="relative after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] disabled:opacity-40"
                      >
                        <Badge
                          tone={transaction.paymentMethod === "MEAL_CARD" ? "brand" : "neutral"}
                        >
                          {SOURCE_LABELS[transaction.paymentMethod as keyof typeof SOURCE_LABELS]}
                        </Badge>
                      </button>
                    ) : null}
                    {transaction.kind === "GOAL" ? <Badge tone="neutral">meta</Badge> : null}
                    {transaction.fromWatch ? (
                      <Watch className="size-3.5" aria-label="Lançado pelo relógio" />
                    ) : null}
                    {transaction.kind === "EXTRA_INCOME" ? (
                      <Badge tone="success">entrada</Badge>
                    ) : null}
                  </span>
                </div>
                <span
                  className={cn(
                    "tabular shrink-0 text-sm font-semibold",
                    transaction.kind === "EXTRA_INCOME" && "text-success"
                  )}
                >
                  {transaction.kind === "EXTRA_INCOME" ? "+" : "−"}
                  {money(transaction.amount)}
                </span>
                <ConfirmDeleteButton
                  label={`Apagar ${transaction.description}`}
                  onConfirm={() => handleDelete(transaction.id)}
                  disabled={pendingId === transaction.id}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <HistoryCard history={data.history} />
    </div>
  );
}

function TodayStat({ label, allowance }: { label: string; allowance: Allowance }) {
  return (
    <Stat
      label={label}
      value={money(allowance.remainingToday)}
      tone={allowance.remainingToday >= 0 ? "positive" : "negative"}
      hint={`de ${money(allowance.dayBudget)} hoje · restam ${money(allowance.monthRemaining)} em ${allowance.daysLeft} dia(s)`}
    />
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn(strong ? "font-semibold" : "text-fg-muted")}>{label}</span>
      <span
        className={cn(
          "tabular font-semibold",
          value < 0 && !strong && "text-fg-muted",
          strong && (value >= 0 ? "text-success" : "text-danger")
        )}
      >
        {money(value)}
      </span>
    </div>
  );
}

/** "Outubro de 2026" — o `capitalize` do CSS fazia "Outubro De 2026". */
const longMonth = (month: YearMonth) => {
  const text = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const navButton =
  "rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg active:bg-surface-hover grid size-11 place-items-center";

/** Voltar a um mês que passou é como se lança o que ficou para trás e se faz a virada dele. */
function MonthNav({ data }: { data: MesData }) {
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Escolher mês">
      {data.previousMonth ? (
        <Link
          href={`/mes?mes=${data.previousMonth}`}
          aria-label={`Ver ${formatMonth(data.previousMonth)}`}
          className={navButton}
        >
          <ChevronLeft className="size-5" />
        </Link>
      ) : (
        <span className="size-11" />
      )}
      <span className="text-base font-semibold">{longMonth(data.month)}</span>
      {data.nextMonth ? (
        <Link
          href={`/mes?mes=${data.nextMonth}`}
          aria-label={`Ver ${formatMonth(data.nextMonth)}`}
          className={navButton}
        >
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className="size-11" />
      )}
    </nav>
  );
}

const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

/**
 * Fechar o mês é o que diz à projeção que ele é história — e só acontece pela
 * virada, que confere os saldos junto. Fechar sem eles fazia a sobra do mês
 * sumir do plano; por isso aqui não existe mais botão de fechar direto.
 */
function SettleBar({ data }: { data: MesData }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function reopen() {
    setPending(true);
    const result = await reopenMonth({ month: data.month });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error ?? "Não deu certo.");
      return;
    }
    toast.success("Mês reaberto.");
    router.refresh();
  }

  if (data.settled) {
    const slack = data.settled.leftover - data.settled.planTarget;
    return (
      <div className="rounded-card bg-surface-subtle flex flex-wrap items-center gap-3 border border-[var(--stroke)] p-4">
        <Lock className="text-fg-muted size-5 shrink-0" />
        <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
          <p className="text-sm font-semibold">{formatMonth(data.month)} está fechado</p>
          <p className="text-fg-muted text-xs">
            Congelado em {money(data.settled.leftover)} de sobra contra{" "}
            {money(data.settled.planTarget)} de meta ({slack >= 0 ? "+" : ""}
            {money(slack)}), com {money(data.settled.cash)} nas caixinhas. A projeção começa depois
            deste mês. Apareceu um lançamento atrasado? Lance e refaça a virada.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
          <Link
            href={`/mes/virada?mes=${data.month}`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "flex-1 sm:flex-none"
            )}
          >
            <RotateCcw className="size-4" />
            Refazer
          </Link>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={pending}
            onClick={reopen}
          >
            <Undo2 className="size-4" />
            Reabrir
          </Button>
        </div>
      </div>
    );
  }

  if (!data.isOver) {
    return (
      <p className="text-fg-muted text-center text-xs">
        {formatMonth(data.month)} está em andamento. A virada abre em {shortDate(data.lastDay)}, o
        último dia do mês.
      </p>
    );
  }

  // A virada parte do saldo das contas. Sem nenhuma cadastrada esse saldo é
  // zero, e todo o dinheiro acumulado simplesmente some do plano.
  if (!data.hasCashAccounts) {
    return (
      <div className="rounded-card bg-warning-bg flex flex-wrap items-center gap-3 border border-[var(--warning)] p-4">
        <AlertTriangle className="text-warning size-5 shrink-0" />
        <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
          <p className="text-sm font-semibold">
            Cadastre onde seu dinheiro está antes de fechar {formatMonth(data.month)}
          </p>
          <p className="text-fg-muted text-xs">
            A projeção passa a partir do saldo das suas contas. Sem nenhuma cadastrada, o saldo é
            zero e tudo que você já guardou some do plano. Vá em Premissas → Caixa e caixinhas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-surface-subtle flex flex-wrap items-center gap-3 border border-[var(--stroke)] p-4">
      <CalendarCheck className="text-brand size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
        <p className="text-sm font-semibold">
          {formatMonth(data.month)} {data.today === data.lastDay ? "termina hoje" : "terminou"} e
          ainda está aberto
        </p>
        <p className="text-fg-muted text-xs">
          Na virada você confere os saldos das caixinhas e fecha o mês de uma vez. Sobra do mês:{" "}
          {money(data.leftover)}.
        </p>
      </div>
      <Link
        href={`/mes/virada?mes=${data.month}`}
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), "w-full sm:w-auto")}
      >
        Fazer a virada
      </Link>
    </div>
  );
}

/** A série que só existe porque os fechamentos são congelados. */
function HistoryCard({ history }: { history: MesData["history"] }) {
  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>O plano previu × eu fiz</CardTitle>
        <p className="text-fg-muted text-xs">
          Cada mês fechado, com a sobra que aconteceu contra a que o plano esperava na época.
        </p>
      </CardHeader>
      {/* Quatro colunas não cabem nos ~300px do celular: lá cada mês vira
          duas linhas — mês e folga em cima, sobra e caixa embaixo. */}
      <CardContent className="flex flex-col gap-3 text-sm sm:gap-1.5">
        {history.map((entry) => {
          const slack = entry.leftover - entry.planTarget;
          return (
            <div
              key={entry.month}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[5rem_auto_1fr_auto]"
            >
              <span className="text-fg-muted font-semibold sm:font-normal">
                {formatMonth(entry.month as YearMonth)}
              </span>
              <span className="tabular text-fg-muted order-3 col-span-2 text-xs sm:order-none sm:col-span-1">
                caixa {money(entry.cash)}
              </span>
              <span className="tabular order-2 col-span-2 sm:order-none sm:col-span-1 sm:text-right">
                {money(entry.leftover)}{" "}
                <span className="text-fg-muted text-xs">/ {money(entry.planTarget)}</span>
              </span>
              <Badge
                tone={slack >= 0 ? "success" : "danger"}
                className="tabular order-1 justify-self-end whitespace-nowrap sm:order-none"
              >
                {slack >= 0 ? "+" : ""}
                {money(slack)}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
