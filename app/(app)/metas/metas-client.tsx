"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deleteGoal, saveGoal } from "@/app/actions/goal.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Stat } from "@/components/ui/stat";
import { formatBRL, toReais, type Cents } from "@/core/domain/shared/money";
import { formatMonth, type YearMonth } from "@/core/domain/shared/month";

export interface GoalRow {
  id: string;
  name: string;
  amount: number;
  targetMonth: string | null;
  fundingSource: string | null;
  note: string | null;
  status: "PLANNED" | "DONE" | "CANCELLED";
  sortOrder: number;
}

const STATUS_LABELS = {
  PLANNED: "Planejada",
  DONE: "Feita",
  CANCELLED: "Cancelada",
} as const;

const emptyGoal: GoalRow = {
  id: "",
  name: "",
  amount: 0,
  targetMonth: null,
  fundingSource: null,
  note: null,
  status: "PLANNED",
  sortOrder: 99,
};

export function MetasClient({
  goals,
  payoffMonth,
  totalPlanned,
}: {
  goals: readonly GoalRow[];
  payoffMonth: YearMonth | null;
  totalPlanned: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<GoalRow | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSave(form: GoalRow) {
    startTransition(async () => {
      const result = await saveGoal({
        id: form.id || undefined,
        name: form.name,
        amount: form.amount,
        targetMonth: form.targetMonth,
        fundingSource: form.fundingSource,
        note: form.note,
        status: form.status,
        sortOrder: form.sortOrder,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Meta salva. A projeção já considerou.");
      setEditing(null);
      router.refresh();
    });
  }

  function handleDelete(id: string, name: string) {
    startTransition(async () => {
      const result = await deleteGoal({ id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${name}" removida.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3">
        <Stat
          label="Total planejado"
          value={formatBRL(totalPlanned as Cents)}
          hint="Soma das metas com data marcada."
        />
        <Stat
          label="Quitação com estas metas"
          value={payoffMonth ? formatMonth(payoffMonth) : "—"}
          hint="Mude um valor ou um mês e veja o efeito aqui."
        />
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Metas</CardTitle>
          <Button variant="primary" size="sm" onClick={() => setEditing(emptyGoal)}>
            <Plus className="size-4" />
            Nova
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-2">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="rounded-control hover:bg-surface-hover flex items-start gap-3 px-2 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{goal.name}</span>
                  {goal.targetMonth ? (
                    <Badge tone="brand">{formatMonth(goal.targetMonth as YearMonth)}</Badge>
                  ) : (
                    <Badge tone="neutral">sem data</Badge>
                  )}
                  {goal.status !== "PLANNED" ? (
                    <Badge tone={goal.status === "DONE" ? "success" : "neutral"}>
                      {STATUS_LABELS[goal.status]}
                    </Badge>
                  ) : null}
                </div>
                {goal.fundingSource ? (
                  <span className="text-fg-muted text-xs">Sai de: {goal.fundingSource}</span>
                ) : null}
                {goal.note ? (
                  <span className="text-fg-muted text-xs leading-snug">{goal.note}</span>
                ) : null}
              </div>

              <span className="tabular shrink-0 text-sm font-semibold">
                {formatBRL(goal.amount as Cents)}
              </span>

              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`Editar ${goal.name}`}
                  onClick={() => setEditing(goal)}
                  className="rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg grid size-9 place-items-center"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${goal.name}`}
                  onClick={() => handleDelete(goal.id, goal.name)}
                  disabled={pending}
                  className="rounded-control text-fg-muted hover:bg-danger-bg hover:text-danger grid size-9 place-items-center disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {editing ? (
        <GoalSheet
          goal={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
}

function GoalSheet({
  goal,
  pending,
  onClose,
  onSave,
}: {
  goal: GoalRow;
  pending: boolean;
  onClose: () => void;
  onSave: (goal: GoalRow) => void;
}) {
  const [form, setForm] = React.useState({
    ...goal,
    amountText: goal.amount ? String(toReais(goal.amount as Cents)).replace(".", ",") : "",
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(form.amountText.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Valor inválido.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Dê um nome à meta.");
      return;
    }
    onSave({ ...form, amount });
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={goal.id ? "Editar meta" : "Nova meta"}
      description="Mudar o valor ou o mês reorganiza a projeção inteira."
      footer={
        <>
          <Button type="button" variant="subtle" size="touch" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="meta-form"
            variant="primary"
            size="touch"
            className="flex-1"
            disabled={pending}
          >
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id="meta-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Anel de noivado"
          />
        </Field>

        <Field label="Custa">
          <Input
            inputMode="decimal"
            value={form.amountText}
            onChange={(event) => setForm({ ...form, amountText: event.target.value })}
            placeholder="0,00"
            className="tabular"
          />
        </Field>

        <Field label="Quando" hint="Deixe vazio para uma meta sem data — ela não entra na conta.">
          <Input
            type="month"
            value={form.targetMonth ?? ""}
            onChange={(event) => setForm({ ...form, targetMonth: event.target.value || null })}
          />
        </Field>

        <Field label="De onde sai">
          <Input
            value={form.fundingSource ?? ""}
            onChange={(event) => setForm({ ...form, fundingSource: event.target.value || null })}
            placeholder="PLR de março"
          />
        </Field>

        <Field label="Observação">
          <Textarea
            value={form.note ?? ""}
            onChange={(event) => setForm({ ...form, note: event.target.value || null })}
            placeholder="O que você precisa lembrar sobre esta meta."
          />
        </Field>

        <Field label="Situação">
          <Select
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as GoalRow["status"] })
            }
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Sheet>
  );
}
