"use client";

import * as React from "react";
import { toast } from "sonner";

import { createTransaction } from "@/app/actions/transaction.actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { formatMonth, type YearMonth } from "@/core/domain/shared/month";
import { cn } from "@/lib/utils";

export interface SheetCategory {
  readonly id: string;
  readonly name: string;
  readonly defaultPaymentMethod: "MEAL_CARD" | "CASH";
}

export interface SheetGoal {
  readonly id: string;
  readonly name: string;
}

type Kind = "EXPENSE" | "EXTRA_INCOME" | "GOAL";

const KIND_LABELS: Record<Kind, string> = {
  EXPENSE: "Gasto",
  GOAL: "Meta",
  EXTRA_INCOME: "Entrada",
};

/**
 * O formulário do botão central. A ordem dos campos é a ordem em que você
 * pensa no caixa do mercado: quanto foi, em quê, com o quê.
 */
export function NewTransactionSheet({
  open,
  onOpenChange,
  categories,
  goals,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly SheetCategory[];
  goals: readonly SheetGoal[];
  today: string;
}) {
  const [kind, setKind] = React.useState<Kind>("EXPENSE");
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [goalId, setGoalId] = React.useState(goals[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = React.useState<"MEAL_CARD" | "CASH">("CASH");
  const [date, setDate] = React.useState(today);
  const [description, setDescription] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  // Ao trocar de categoria, o meio de pagamento segue o padrão dela: comida já
  // vem marcada como VA. Feito no próprio handler, não num efeito —
  // assim uma escolha manual de "Dinheiro" depois disso não é desfeita.
  function selectCategory(id: string) {
    setCategoryId(id);
    const category = categories.find((c) => c.id === id);
    if (category) setPaymentMethod(category.defaultPaymentMethod);
  }

  function reset() {
    setAmount("");
    setDescription("");
    setDate(today);
    setKind("EXPENSE");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }

    startTransition(async () => {
      const result = await createTransaction({
        date,
        description: description.trim() || KIND_LABELS[kind],
        amount: value,
        kind,
        categoryId: kind === "EXPENSE" ? categoryId : null,
        goalId: kind === "GOAL" ? goalId : null,
        paymentMethod: kind === "EXPENSE" ? paymentMethod : "CASH",
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (result.movedGoal) {
        toast.success(
          `Lançado. ${result.movedGoal.name} passou para ${formatMonth(result.movedGoal.month as YearMonth)}, o mês do pagamento.`
        );
      } else {
        toast.success("Lançado.");
      }
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo lançamento"
      description="Leva dez segundos. Depois o painel do mês se vira sozinho."
      footer={
        <>
          <Button
            type="button"
            variant="subtle"
            size="touch"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="novo-lancamento"
            variant="primary"
            size="touch"
            className="flex-1"
            disabled={pending}
          >
            {pending ? "Salvando…" : "Lançar"}
          </Button>
        </>
      }
    >
      <form id="novo-lancamento" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-control bg-surface-hover grid grid-cols-3 gap-1 p-1">
          {(Object.keys(KIND_LABELS) as Kind[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={cn(
                "rounded-control h-9 text-sm font-semibold transition-colors",
                kind === option
                  ? "bg-surface text-fg shadow-[var(--shadow-2)]"
                  : "text-fg-muted hover:text-fg"
              )}
            >
              {KIND_LABELS[option]}
            </button>
          ))}
        </div>

        <Field label="Valor">
          <Input
            // `decimal` abre o teclado numérico com vírgula no Android.
            inputMode="decimal"
            autoFocus
            placeholder="0,00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="tabular h-14 text-2xl font-semibold"
          />
        </Field>

        {kind === "EXPENSE" ? (
          <>
            <Field label="Categoria">
              <Select value={categoryId} onChange={(event) => selectCategory(event.target.value)}>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-fg-muted text-xs font-semibold">Pago com</span>
              <div className="rounded-control bg-surface-hover grid grid-cols-2 gap-1 p-1">
                {(
                  [
                    ["CASH", "Dinheiro"],
                    ["MEAL_CARD", "VA"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethod(value)}
                    className={cn(
                      "rounded-control h-9 text-sm font-semibold transition-colors",
                      paymentMethod === value
                        ? "bg-surface text-fg shadow-[var(--shadow-2)]"
                        : "text-fg-muted hover:text-fg"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {kind === "GOAL" ? (
          <Field label="Meta" hint="Gasto de meta não consome o orçamento do mês.">
            <Select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Descrição">
          <Input
            placeholder="Opcional"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field label="Data">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
