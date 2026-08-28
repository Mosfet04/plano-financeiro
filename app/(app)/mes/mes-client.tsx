"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deleteTransaction } from "@/app/actions/transaction.actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { Stat } from "@/components/ui/stat";
import { formatBRL, type Cents } from "@/core/domain/shared/money";
import { formatMonth, type YearMonth } from "@/core/domain/shared/month";
import { cn } from "@/lib/utils";

export interface MesData {
  month: YearMonth;
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
  salary: number;
  extraIncome: number;
  variableSpent: number;
  goalSpent: number;
  mealCardOverflow: number;
  leftover: number;
  planTarget: number;
  onPlan: boolean;
  slack: number;
  daysRemaining: number;
  freePerDay: number;
  leisurePerDay: number;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    kind: string;
    categoryName: string | null;
    paymentMethod: string;
    amount: number;
  }>;
}

const money = (value: number) => formatBRL(value as Cents);

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

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sobrou este mês"
          value={money(data.leftover)}
          tone={data.leftover >= 0 ? "positive" : "negative"}
          hint={`Meta do plano: ${money(data.planTarget)}`}
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
        <Stat
          label="Livre por dia"
          value={money(data.freePerDay)}
          hint={`Faltam ${data.daysRemaining} dia(s) no mês.`}
        />
        <Stat
          label="Ainda tem no vale-refeição"
          value={money(data.mealCardRemaining)}
          tone={data.mealCardRemaining > 0 ? "positive" : "negative"}
          hint={
            data.mealCardRemaining > 0
              ? "Enquanto sobrar aqui, comida não custa do salário."
              : "Zerado: cada refeição agora sai do bolso."
          }
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onde você pode gastar</CardTitle>
            <p className="text-fg-muted text-xs">
              Só gasto em dinheiro consome o orçamento. O vale-refeição tem controle próprio.
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
              <Line label="Salário" value={data.salary} />
              {data.extraIncome > 0 ? <Line label="Renda extra" value={data.extraIncome} /> : null}
              <Line label="Contas fixas" value={-data.fixedTotal} />
              <Line label="Gastos variáveis" value={-data.variableSpent} />
              {data.goalSpent > 0 ? <Line label="Metas" value={-data.goalSpent} /> : null}
              {data.mealCardOverflow > 0 ? (
                <Line label="Estourou o vale-refeição" value={-data.mealCardOverflow} />
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
                  <span className="text-fg-muted flex items-center gap-1.5 text-xs">
                    {new Date(`${transaction.date}T12:00:00Z`).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                    {transaction.categoryName ? ` · ${transaction.categoryName}` : null}
                    {transaction.paymentMethod === "MEAL_CARD" ? (
                      <Badge tone="brand">vale-refeição</Badge>
                    ) : null}
                    {transaction.kind === "GOAL" ? <Badge tone="neutral">meta</Badge> : null}
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
                <button
                  type="button"
                  aria-label={`Apagar ${transaction.description}`}
                  onClick={() => handleDelete(transaction.id)}
                  disabled={pendingId === transaction.id}
                  className="rounded-control text-fg-muted hover:bg-danger-bg hover:text-danger grid size-9 shrink-0 place-items-center disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
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
          value < 0 && !strong && "text-fg-muted",
          strong && (value >= 0 ? "text-success" : "text-danger")
        )}
      >
        {money(value)}
      </span>
    </div>
  );
}
