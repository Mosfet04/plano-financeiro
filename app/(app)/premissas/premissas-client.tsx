"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  deleteBudgetCategory,
  deleteCashAccount,
  deleteInvestment,
  deleteRecurringItem,
  saveBudgetCategory,
  saveCashAccount,
  saveFinancing,
  saveIncomeSettings,
  saveInvestment,
  saveRecurringItem,
  saveYieldPolicy,
} from "@/app/actions/assumptions.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IntegerInput, MoneyInput, PercentInput } from "@/components/ui/number-inputs";
import { Sheet } from "@/components/ui/sheet";
import { formatBRL, toReais, type Cents } from "@/core/domain/shared/money";
import { addMonths, formatMonth, monthOfISODate, type YearMonth } from "@/core/domain/shared/month";

export interface PremissasData {
  income: {
    grossSalary: number;
    netSalary: number;
    annualRaise: number;
    raiseMonth: number;
    mealCardMonthly: number;
    thirteenthNet: number;
    thirteenthMonths: number[];
    vacationBonus: number;
    vacationMonth: number;
    plrGrossSalaries: number;
    plrMonth: number;
  };
  recurringItems: Array<{
    id: string;
    name: string;
    direction: "INCOME" | "EXPENSE";
    group: "HOUSING" | "FIXED";
    amount: number;
    dueDay: number | null;
    startsOn: string | null;
    endsOn: string | null;
    active: boolean;
    sortOrder: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    monthlyBudget: number;
    defaultPaymentMethod: "MEAL_CARD" | "CASH";
    color: string;
    active: boolean;
    sortOrder: number;
  }>;
  financing: {
    name: string;
    principal: number;
    termMonths: number;
    annualInterest: number;
    system: "SAC" | "PRICE";
    insuranceMonthly: number;
    firstInstallmentMonth: string;
    applyReferenceRate: boolean;
  } | null;
  investments: Array<{
    id: string;
    name: string;
    amount: number;
    maturityDate: string;
    indexer: "CDI_PCT" | "PREFIXED" | "IPCA_PLUS" | "SELIC_PCT";
    indexerValue: number;
    taxExempt: boolean;
    instruction: string | null;
  }>;
  cashAccounts: Array<{
    id: string;
    name: string;
    balance: number;
    indexer: "CDI_PCT" | "PREFIXED" | "IPCA_PLUS" | "SELIC_PCT" | null;
    indexerValue: number;
    taxExempt: boolean;
    checkedOn: string;
  }>;
  /** Data civil de hoje, para pré-preencher "saldo conferido em". */
  today: string;
  yieldPolicy: {
    mode: "MANUAL" | "CDI_LINKED";
    manualAnnualNet: number;
    cdiPercent: number;
    incomeTaxRate: number;
    accrueInvestments: boolean;
  };
  reserveTargets: Array<{ id: string; effectiveFrom: string; months: number }>;
  referenceRateMonthly: number | null;
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const INDEXER_LABELS = {
  CDI_PCT: "% do CDI",
  SELIC_PCT: "% da Selic",
  PREFIXED: "Prefixado (a.a.)",
  IPCA_PLUS: "IPCA + (a.a.)",
} as const;

const money = (value: number) => formatBRL(value as Cents);
const toInput = (value: number) => toReais(value as Cents);

function MonthSelect({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
}) {
  return (
    <Select
      id={id}
      value={String(value)}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {MONTHS.map((name, index) => (
        <option key={name} value={index + 1}>
          {name}
        </option>
      ))}
    </Select>
  );
}

export function PremissasClient({ data }: { data: PremissasData }) {
  return (
    <div className="flex flex-col gap-4">
      <RendaSection income={data.income} />
      <RecurringSection items={data.recurringItems} />
      <CategoriesSection categories={data.categories} />
      <FinancingSection financing={data.financing} referenceRate={data.referenceRateMonthly} />
      <InvestmentsSection investments={data.investments} />
      <CashAccountsSection accounts={data.cashAccounts} today={data.today} />
      <YieldSection policy={data.yieldPolicy} reserveTargets={data.reserveTargets} />
    </div>
  );
}

/** Botão de salvar padrão de todas as seções. */
function SaveBar({ pending }: { pending: boolean }) {
  return (
    <div className="flex justify-end pt-1">
      <Button type="submit" variant="primary" size="touch" disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    (action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error ?? "Não deu para salvar.");
          return;
        }
        toast.success(successMessage);
        router.refresh();
      });
    },
    [router]
  );

  return { pending, run };
}

function RendaSection({ income }: { income: PremissasData["income"] }) {
  const { pending, run } = useSaver();
  const [form, setForm] = React.useState({
    grossSalary: toInput(income.grossSalary),
    netSalary: toInput(income.netSalary),
    annualRaise: income.annualRaise,
    raiseMonth: income.raiseMonth,
    mealCardMonthly: toInput(income.mealCardMonthly),
    thirteenthNet: toInput(income.thirteenthNet),
    thirteenthMonths: income.thirteenthMonths.join(","),
    vacationBonus: toInput(income.vacationBonus),
    vacationMonth: income.vacationMonth,
    plrGrossSalaries: income.plrGrossSalaries,
    plrMonth: income.plrMonth,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renda</CardTitle>
        <p className="text-fg-muted text-xs">
          O salário aqui é o do primeiro mês da projeção. O reajuste é aplicado todo ano no mês
          escolhido.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const thirteenthMonths = form.thirteenthMonths
              .split(",")
              .map((part) => Number(part.trim()))
              .filter((value) => value >= 1 && value <= 12);

            if (thirteenthMonths.length === 0) {
              toast.error("Informe ao menos um mês de pagamento do 13º.");
              return;
            }

            run(
              () => saveIncomeSettings({ ...form, thirteenthMonths }),
              "Renda atualizada. A projeção já refez a conta."
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Salário bruto">
              <MoneyInput
                value={form.grossSalary}
                onChange={(grossSalary) => setForm({ ...form, grossSalary })}
              />
            </Field>
            <Field label="Salário líquido">
              <MoneyInput
                value={form.netSalary}
                onChange={(netSalary) => setForm({ ...form, netSalary })}
              />
            </Field>
            <Field label="Reajuste anual" hint="A maior alavanca do prazo de quitação.">
              <PercentInput
                value={form.annualRaise}
                onChange={(annualRaise) => setForm({ ...form, annualRaise })}
              />
            </Field>
            <Field label="Mês do reajuste">
              <MonthSelect
                value={form.raiseMonth}
                onChange={(raiseMonth) => setForm({ ...form, raiseMonth })}
              />
            </Field>
            <Field label="Vale-refeição mensal" hint="Não é dinheiro livre: só paga comida.">
              <MoneyInput
                value={form.mealCardMonthly}
                onChange={(mealCardMonthly) => setForm({ ...form, mealCardMonthly })}
              />
            </Field>
            <Field label="13º líquido (ano)">
              <MoneyInput
                value={form.thirteenthNet}
                onChange={(thirteenthNet) => setForm({ ...form, thirteenthNet })}
              />
            </Field>
            <Field label="Meses do 13º" hint="Separados por vírgula. Ex.: 11,12">
              <Input
                value={form.thirteenthMonths}
                onChange={(event) => setForm({ ...form, thirteenthMonths: event.target.value })}
              />
            </Field>
            <Field label="Abono de férias (1/3)">
              <MoneyInput
                value={form.vacationBonus}
                onChange={(vacationBonus) => setForm({ ...form, vacationBonus })}
              />
            </Field>
            <Field label="Mês das férias">
              <MonthSelect
                value={form.vacationMonth}
                onChange={(vacationMonth) => setForm({ ...form, vacationMonth })}
              />
            </Field>
            <Field label="PLR em salários brutos" hint="Teste com 2 para ver o cenário ruim.">
              <Input
                inputMode="decimal"
                className="tabular"
                value={String(form.plrGrossSalaries)}
                onChange={(event) =>
                  setForm({ ...form, plrGrossSalaries: Number(event.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Mês da PLR">
              <MonthSelect
                value={form.plrMonth}
                onChange={(plrMonth) => setForm({ ...form, plrMonth })}
              />
            </Field>
          </div>
          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}

type RecurringItemRow = PremissasData["recurringItems"][number];

const emptyItem: RecurringItemRow = {
  id: "",
  name: "",
  direction: "EXPENSE",
  group: "FIXED",
  amount: 0,
  dueDay: null,
  startsOn: null,
  endsOn: null,
  active: true,
  sortOrder: 99,
};

function RecurringSection({ items }: { items: PremissasData["recurringItems"] }) {
  const { pending, run } = useSaver();
  const [editing, setEditing] = React.useState<RecurringItemRow | null>(null);

  const housing = items.filter((item) => item.group === "HOUSING");
  const fixed = items.filter((item) => item.group === "FIXED");

  const renderRow = (item: RecurringItemRow) => (
    <div
      key={item.id}
      className="rounded-control hover:bg-surface-hover flex items-center gap-3 px-2 py-2"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">
          {item.name}
          {item.direction === "INCOME" ? (
            <Badge tone="success" className="ml-2">
              entrada
            </Badge>
          ) : null}
          {!item.active ? (
            <Badge tone="neutral" className="ml-2">
              inativa
            </Badge>
          ) : null}
        </span>
        <span className="text-fg-muted text-xs">
          {item.dueDay ? `Vence dia ${item.dueDay}` : "Sem vencimento fixo"}
          {item.startsOn ? ` · começa em ${formatMonth(item.startsOn as YearMonth)}` : ""}
          {item.endsOn ? ` · acaba em ${formatMonth(item.endsOn as YearMonth)}` : ""}
        </span>
      </div>
      <span className="tabular shrink-0 text-sm font-semibold">{money(item.amount)}</span>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`Editar ${item.name}`}
          onClick={() => setEditing(item)}
          className="rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg grid size-9 place-items-center"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Remover ${item.name}`}
          disabled={pending}
          onClick={() =>
            run(() => deleteRecurringItem({ id: item.id }), `"${item.name}" removida.`)
          }
          className="rounded-control text-fg-muted hover:bg-danger-bg hover:text-danger grid size-9 place-items-center disabled:opacity-40"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Contas recorrentes</CardTitle>
          <p className="text-fg-muted text-xs">
            Datas de início e fim resolvem a mudança sozinhas: o aluguel acaba no mês da primeira
            parcela e o condomínio começa nele.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setEditing(emptyItem)}>
          <Plus className="size-4" />
          Nova
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-2">
        <div className="flex flex-col gap-1">
          <span className="text-fg-muted px-2 text-xs font-semibold tracking-wide uppercase">
            Moradia
          </span>
          {housing.map(renderRow)}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-fg-muted px-2 text-xs font-semibold tracking-wide uppercase">
            Outras fixas
          </span>
          {fixed.map(renderRow)}
        </div>
      </CardContent>

      {editing ? (
        <RecurringSheet
          item={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(form) =>
            run(async () => {
              const result = await saveRecurringItem({
                id: form.id || undefined,
                name: form.name,
                direction: form.direction,
                group: form.group,
                amount: form.amount,
                dueDay: form.dueDay,
                startsOn: form.startsOn,
                endsOn: form.endsOn,
                active: form.active,
                sortOrder: form.sortOrder,
              });
              if (result.ok) setEditing(null);
              return result;
            }, "Conta salva.")
          }
        />
      ) : null}
    </Card>
  );
}

function RecurringSheet({
  item,
  pending,
  onClose,
  onSave,
}: {
  item: RecurringItemRow;
  pending: boolean;
  onClose: () => void;
  onSave: (item: RecurringItemRow & { amount: number }) => void;
}) {
  const [form, setForm] = React.useState({ ...item, amount: toInput(item.amount) });

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={item.id ? "Editar conta" : "Nova conta"}
      footer={
        <>
          <Button type="button" variant="subtle" size="touch" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="conta-form"
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
      <form
        id="conta-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.name.trim()) {
            toast.error("Dê um nome à conta.");
            return;
          }
          onSave(form);
        }}
      >
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Valor">
          <MoneyInput value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        </Field>
        <Field label="Grupo" hint="Moradia soma com a parcela do financiamento na projeção.">
          <Select
            value={form.group}
            onChange={(event) =>
              setForm({ ...form, group: event.target.value as RecurringItemRow["group"] })
            }
          >
            <option value="HOUSING">Moradia</option>
            <option value="FIXED">Outras fixas</option>
          </Select>
        </Field>
        <Field label="Tipo" hint="Entrada abate o grupo — é como o auxílio home office funciona.">
          <Select
            value={form.direction}
            onChange={(event) =>
              setForm({ ...form, direction: event.target.value as RecurringItemRow["direction"] })
            }
          >
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Entrada</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Começa em" hint="Vazio = sempre valeu.">
            <Input
              type="month"
              value={form.startsOn ?? ""}
              onChange={(event) => setForm({ ...form, startsOn: event.target.value || null })}
            />
          </Field>
          <Field label="Acaba em" hint="Vazio = não acaba.">
            <Input
              type="month"
              value={form.endsOn ?? ""}
              onChange={(event) => setForm({ ...form, endsOn: event.target.value || null })}
            />
          </Field>
        </div>
        <Field label="Dia do vencimento">
          <Input
            type="number"
            min={1}
            max={31}
            value={form.dueDay ?? ""}
            onChange={(event) =>
              setForm({ ...form, dueDay: event.target.value ? Number(event.target.value) : null })
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          Ativa
        </label>
      </form>
    </Sheet>
  );
}

type CategoryRow = PremissasData["categories"][number];

const emptyCategory: CategoryRow = {
  id: "",
  name: "",
  monthlyBudget: 0,
  defaultPaymentMethod: "CASH",
  color: "chart-1",
  active: true,
  sortOrder: 99,
};

function CategoriesSection({ categories }: { categories: PremissasData["categories"] }) {
  const { pending, run } = useSaver();
  const [editing, setEditing] = React.useState<CategoryRow | null>(null);

  const total = categories
    .filter((category) => category.active)
    .reduce((sum, category) => sum + category.monthlyBudget, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Orçamento variável</CardTitle>
          <p className="text-fg-muted text-xs">
            Total de {money(total)} por mês — é este número que a projeção usa como gasto variável.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setEditing(emptyCategory)}>
          <Plus className="size-4" />
          Nova
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-2">
        {categories.map((category) => (
          <div
            key={category.id}
            className="rounded-control hover:bg-surface-hover flex items-center gap-3 px-2 py-2"
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: `var(--${category.color})` }}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{category.name}</span>
              <span className="text-fg-muted text-xs">
                {category.defaultPaymentMethod === "MEAL_CARD"
                  ? "Padrão: vale-refeição"
                  : "Padrão: dinheiro"}
                {!category.active ? " · inativa" : ""}
              </span>
            </div>
            <span className="tabular shrink-0 text-sm font-semibold">
              {money(category.monthlyBudget)}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`Editar ${category.name}`}
                onClick={() => setEditing(category)}
                className="rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg grid size-9 place-items-center"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Remover ${category.name}`}
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteBudgetCategory({ id: category.id }),
                    `"${category.name}" removida. Os lançamentos ficam no histórico.`
                  )
                }
                className="rounded-control text-fg-muted hover:bg-danger-bg hover:text-danger grid size-9 place-items-center disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </CardContent>

      {editing ? (
        <CategorySheet
          category={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(form) =>
            run(async () => {
              const result = await saveBudgetCategory({
                id: form.id || undefined,
                name: form.name,
                monthlyBudget: form.monthlyBudget,
                defaultPaymentMethod: form.defaultPaymentMethod,
                color: form.color,
                active: form.active,
                sortOrder: form.sortOrder,
              });
              if (result.ok) setEditing(null);
              return result;
            }, "Categoria salva.")
          }
        />
      ) : null}
    </Card>
  );
}

function CategorySheet({
  category,
  pending,
  onClose,
  onSave,
}: {
  category: CategoryRow;
  pending: boolean;
  onClose: () => void;
  onSave: (category: CategoryRow) => void;
}) {
  const [form, setForm] = React.useState({
    ...category,
    monthlyBudget: toInput(category.monthlyBudget),
  });

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={category.id ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          <Button type="button" variant="subtle" size="touch" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="categoria-form"
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
      <form
        id="categoria-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.name.trim()) {
            toast.error("Dê um nome à categoria.");
            return;
          }
          onSave(form);
        }}
      >
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Orçamento mensal">
          <MoneyInput
            value={form.monthlyBudget}
            onChange={(monthlyBudget) => setForm({ ...form, monthlyBudget })}
          />
        </Field>
        <Field label="Pago normalmente com">
          <Select
            value={form.defaultPaymentMethod}
            onChange={(event) =>
              setForm({
                ...form,
                defaultPaymentMethod: event.target.value as CategoryRow["defaultPaymentMethod"],
              })
            }
          >
            <option value="CASH">Dinheiro</option>
            <option value="MEAL_CARD">Vale-refeição</option>
          </Select>
        </Field>
        <Field label="Cor">
          <Select
            value={form.color}
            onChange={(event) => setForm({ ...form, color: event.target.value })}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((index) => (
              <option key={index} value={`chart-${index}`}>
                Cor {index}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          Ativa
        </label>
      </form>
    </Sheet>
  );
}

function FinancingSection({
  financing,
  referenceRate,
}: {
  financing: PremissasData["financing"];
  referenceRate: number | null;
}) {
  const { pending, run } = useSaver();
  const [form, setForm] = React.useState(
    financing
      ? {
          ...financing,
          principal: toInput(financing.principal),
          insuranceMonthly: toInput(financing.insuranceMonthly),
        }
      : {
          name: "Financiamento",
          principal: 0,
          termMonths: 420,
          annualInterest: 0,
          system: "SAC" as const,
          insuranceMonthly: 0,
          firstInstallmentMonth: "",
          applyReferenceRate: false,
        }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financiamento</CardTitle>
        <p className="text-fg-muted text-xs">
          A parcela é recalculada mês a mês a partir do saldo devedor: juros + amortização +
          seguros.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!/^\d{4}-\d{2}$/.test(form.firstInstallmentMonth)) {
              toast.error("Informe o mês da primeira parcela.");
              return;
            }
            run(() => saveFinancing(form), "Financiamento atualizado.");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Valor financiado">
              <MoneyInput
                value={form.principal}
                onChange={(principal) => setForm({ ...form, principal })}
              />
            </Field>
            <Field label="Prazo (meses)">
              <IntegerInput
                value={form.termMonths}
                onChange={(termMonths) => setForm({ ...form, termMonths })}
              />
            </Field>
            <Field label="Juros ao ano" hint="Taxa nominal do contrato, não o CET.">
              <PercentInput
                value={form.annualInterest}
                onChange={(annualInterest) => setForm({ ...form, annualInterest })}
              />
            </Field>
            <Field label="Sistema">
              <Select
                value={form.system}
                onChange={(event) =>
                  setForm({ ...form, system: event.target.value as "SAC" | "PRICE" })
                }
              >
                <option value="SAC">SAC (parcela decrescente)</option>
                <option value="PRICE">PRICE (parcela fixa)</option>
              </Select>
            </Field>
            <Field label="Seguros + taxa (mensal)">
              <MoneyInput
                value={form.insuranceMonthly}
                onChange={(insuranceMonthly) => setForm({ ...form, insuranceMonthly })}
              />
            </Field>
            <Field label="Primeira parcela" hint="É o mês em que a moradia dá o salto.">
              <Input
                type="month"
                value={form.firstInstallmentMonth}
                onChange={(event) =>
                  setForm({ ...form, firstInstallmentMonth: event.target.value })
                }
              />
            </Field>
          </div>

          <label className="rounded-control bg-surface-subtle flex items-start gap-2 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand-primary)]"
              checked={form.applyReferenceRate}
              onChange={(event) => setForm({ ...form, applyReferenceRate: event.target.checked })}
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">Corrigir o saldo devedor pela TR</span>
              <span className="text-fg-muted text-xs">
                A planilha assume TR zero. No último snapshot ela está em{" "}
                {referenceRate !== null
                  ? `${(referenceRate * 100).toFixed(4)}% ao mês`
                  : "valor não capturado"}
                , o que em 420 meses não é desprezível. Ligar aqui deixa o plano mais pessimista e
                mais realista.
              </span>
            </span>
          </label>

          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}

type InvestmentRow = PremissasData["investments"][number];

const emptyInvestment: InvestmentRow = {
  id: "",
  name: "",
  amount: 0,
  maturityDate: "",
  indexer: "CDI_PCT",
  indexerValue: 1,
  taxExempt: false,
  instruction: null,
};

function InvestmentsSection({ investments }: { investments: PremissasData["investments"] }) {
  const { pending, run } = useSaver();
  const [editing, setEditing] = React.useState<InvestmentRow | null>(null);
  const total = investments.reduce((sum, investment) => sum + investment.amount, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Aplicações</CardTitle>
          <p className="text-fg-muted text-xs">
            {money(total)} na carteira. Cada uma cai no caixa do mês em que vence.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setEditing(emptyInvestment)}>
          <Plus className="size-4" />
          Nova
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-2">
        {investments.map((investment) => (
          <div
            key={investment.id}
            className="rounded-control hover:bg-surface-hover flex items-start gap-3 px-2 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">
                {investment.name}
                {investment.taxExempt ? (
                  <Badge tone="success" className="ml-2">
                    isenta
                  </Badge>
                ) : null}
              </span>
              <span className="text-fg-muted text-xs">
                Vence em{" "}
                {new Date(`${investment.maturityDate}T12:00:00Z`).toLocaleDateString("pt-BR")}
                {investment.instruction ? ` · ${investment.instruction}` : ""}
              </span>
            </div>
            <span className="tabular shrink-0 text-sm font-semibold">
              {money(investment.amount)}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`Editar ${investment.name}`}
                onClick={() => setEditing(investment)}
                className="rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg grid size-9 place-items-center"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Remover ${investment.name}`}
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteInvestment({ id: investment.id }),
                    `"${investment.name}" removida.`
                  )
                }
                className="rounded-control text-fg-muted hover:bg-danger-bg hover:text-danger grid size-9 place-items-center disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </CardContent>

      {editing ? (
        <InvestmentSheet
          investment={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(form) =>
            run(async () => {
              const result = await saveInvestment({
                id: form.id || undefined,
                name: form.name,
                amount: form.amount,
                maturityDate: form.maturityDate,
                indexer: form.indexer,
                indexerValue: form.indexerValue,
                taxExempt: form.taxExempt,
                instruction: form.instruction,
              });
              if (result.ok) setEditing(null);
              return result;
            }, "Aplicação salva.")
          }
        />
      ) : null}
    </Card>
  );
}

function InvestmentSheet({
  investment,
  pending,
  onClose,
  onSave,
}: {
  investment: InvestmentRow;
  pending: boolean;
  onClose: () => void;
  onSave: (investment: InvestmentRow) => void;
}) {
  const [form, setForm] = React.useState({ ...investment, amount: toInput(investment.amount) });
  const isPercentOfIndex = form.indexer === "CDI_PCT" || form.indexer === "SELIC_PCT";

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={investment.id ? "Editar aplicação" : "Nova aplicação"}
      footer={
        <>
          <Button type="button" variant="subtle" size="touch" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="aplicacao-form"
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
      <form
        id="aplicacao-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.maturityDate)) {
            toast.error("Nome e data de vencimento são obrigatórios.");
            return;
          }
          onSave(form);
        }}
      >
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="CDB Banco X 110% CDI"
          />
        </Field>
        <Field label="Valor atual">
          <MoneyInput value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        </Field>
        <Field label="Vence em">
          <Input
            type="date"
            value={form.maturityDate}
            onChange={(event) => setForm({ ...form, maturityDate: event.target.value })}
          />
        </Field>
        <Field label="Indexador">
          <Select
            value={form.indexer}
            onChange={(event) =>
              setForm({ ...form, indexer: event.target.value as InvestmentRow["indexer"] })
            }
          >
            {Object.entries(INDEXER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={isPercentOfIndex ? "Percentual do índice" : "Taxa ao ano"}
          hint={isPercentOfIndex ? "103% do CDI → digite 103." : undefined}
        >
          <PercentInput
            value={form.indexerValue}
            onChange={(indexerValue) => setForm({ ...form, indexerValue })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={form.taxExempt}
            onChange={(event) => setForm({ ...form, taxExempt: event.target.checked })}
          />
          Isenta de IR (LCI/LCA)
        </label>
        <Field label="O que fazer no vencimento">
          <Textarea
            value={form.instruction ?? ""}
            onChange={(event) => setForm({ ...form, instruction: event.target.value || null })}
            placeholder="Não renove. Move para liquidez diária."
          />
        </Field>
      </form>
    </Sheet>
  );
}

type CashAccountRow = PremissasData["cashAccounts"][number];

const emptyCashAccount: CashAccountRow = {
  id: "",
  name: "",
  balance: 0,
  indexer: "CDI_PCT",
  indexerValue: 1,
  taxExempt: false,
  checkedOn: "",
};

const cashRateLabel = (account: CashAccountRow) => {
  if (account.indexer === null) return "não rende";
  const value = account.indexerValue;
  switch (account.indexer) {
    case "CDI_PCT":
      return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do CDI`;
    case "SELIC_PCT":
      return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% da Selic`;
    case "IPCA_PLUS":
      return `IPCA + ${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    case "PREFIXED":
      return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`;
  }
};

function CashAccountsSection({
  accounts,
  today,
}: {
  accounts: PremissasData["cashAccounts"];
  today: string;
}) {
  const { pending, run } = useSaver();
  const [editing, setEditing] = React.useState<CashAccountRow | null>(null);
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  // O saldo conferido mais recente é o que manda: a projeção recomeça no mês
  // dele, porque ele já embute o que foi guardado nos meses vividos.
  const conferredOn = accounts.reduce<string | null>(
    (latest, account) =>
      latest === null || account.checkedOn > latest ? account.checkedOn : latest,
    null
  );
  const conferredMonth = conferredOn === null ? null : monthOfISODate(conferredOn);
  const isStale = conferredMonth !== null && conferredMonth < monthOfISODate(today);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Caixa e caixinhas</CardTitle>
          <p className="text-fg-muted text-xs">
            {money(total)} líquidos. Não vence — já é o caixa do primeiro mês, e rende ali mesmo.
            Enche a reserva até o alvo e o que passa vira caixa de quitação.
          </p>
          {conferredMonth ? (
            <p className="text-fg-muted text-xs">
              Conferido em <strong>{formatMonth(conferredMonth)}</strong> — a projeção começa nesse
              mês e volta a acumular em <strong>{formatMonth(addMonths(conferredMonth, 1))}</strong>
              . O saldo já conta como o resultado do mês conferido.
            </p>
          ) : null}
          {isStale ? (
            <p className="text-warning text-xs font-semibold">
              O saldo é de um mês que já passou. Confira e atualize para o plano partir da
              realidade.
            </p>
          ) : null}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setEditing({ ...emptyCashAccount, checkedOn: today })}
        >
          <Plus className="size-4" />
          Nova
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-2">
        {accounts.length === 0 ? (
          <p className="text-fg-muted px-2 py-2 text-sm">
            Nenhuma conta cadastrada — a projeção começa com caixa zero.
          </p>
        ) : null}
        {accounts.map((account) => (
          <div
            key={account.id}
            className="rounded-control hover:bg-surface-hover flex items-start gap-3 px-2 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">
                {account.name}
                {account.taxExempt ? (
                  <Badge tone="success" className="ml-2">
                    isenta
                  </Badge>
                ) : null}
              </span>
              <span className="text-fg-muted text-xs">
                {cashRateLabel(account)} · conferido em{" "}
                {new Date(`${account.checkedOn}T12:00:00Z`).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <span className="tabular shrink-0 text-sm font-semibold">{money(account.balance)}</span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`Editar ${account.name}`}
                onClick={() => setEditing(account)}
                className="rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg grid size-9 place-items-center"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Remover ${account.name}`}
                disabled={pending}
                onClick={() =>
                  run(() => deleteCashAccount({ id: account.id }), `"${account.name}" removida.`)
                }
                className="rounded-control text-fg-muted hover:bg-danger-bg hover:text-danger grid size-9 place-items-center disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </CardContent>

      {editing ? (
        <CashAccountSheet
          account={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(form) =>
            run(async () => {
              const result = await saveCashAccount({
                id: form.id || undefined,
                name: form.name,
                balance: form.balance,
                indexer: form.indexer,
                indexerValue: form.indexerValue,
                taxExempt: form.taxExempt,
                checkedOn: form.checkedOn,
              });
              if (result.ok) setEditing(null);
              return result;
            }, "Saldo salvo.")
          }
        />
      ) : null}
    </Card>
  );
}

function CashAccountSheet({
  account,
  pending,
  onClose,
  onSave,
}: {
  account: CashAccountRow;
  pending: boolean;
  onClose: () => void;
  onSave: (account: CashAccountRow) => void;
}) {
  const [form, setForm] = React.useState({ ...account, balance: toInput(account.balance) });
  const isPercentOfIndex = form.indexer === "CDI_PCT" || form.indexer === "SELIC_PCT";

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={account.id ? "Editar conta" : "Nova conta de caixa"}
      footer={
        <>
          <Button type="button" variant="subtle" size="touch" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="conta-caixa-form"
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
      <form
        id="conta-caixa-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.checkedOn)) {
            toast.error("Nome e data do saldo conferido são obrigatórios.");
            return;
          }
          onSave(form);
        }}
      >
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Caixinha Nubank"
          />
        </Field>
        <Field label="Saldo hoje">
          <MoneyInput value={form.balance} onChange={(balance) => setForm({ ...form, balance })} />
        </Field>
        <Field
          label="Saldo conferido em"
          hint="A projeção recomeça neste mês. Confira ao fechar o mês: o saldo já conta como o resultado dele."
        >
          <Input
            type="date"
            value={form.checkedOn}
            onChange={(event) => setForm({ ...form, checkedOn: event.target.value })}
          />
        </Field>
        <Field label="Rendimento">
          <Select
            value={form.indexer ?? "NONE"}
            onChange={(event) =>
              setForm({
                ...form,
                indexer:
                  event.target.value === "NONE"
                    ? null
                    : (event.target.value as Exclude<CashAccountRow["indexer"], null>),
              })
            }
          >
            <option value="NONE">Não rende (conta corrente)</option>
            {Object.entries(INDEXER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {form.indexer === null ? null : (
          <>
            <Field
              label={isPercentOfIndex ? "Percentual do índice" : "Taxa ao ano"}
              hint={isPercentOfIndex ? "100% do CDI → digite 100." : undefined}
            >
              <PercentInput
                value={form.indexerValue}
                onChange={(indexerValue) => setForm({ ...form, indexerValue })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand-primary)]"
                checked={form.taxExempt}
                onChange={(event) => setForm({ ...form, taxExempt: event.target.checked })}
              />
              Isenta de IR (LCI/LCA, poupança)
            </label>
          </>
        )}
      </form>
    </Sheet>
  );
}

function YieldSection({
  policy,
  reserveTargets,
}: {
  policy: PremissasData["yieldPolicy"];
  reserveTargets: PremissasData["reserveTargets"];
}) {
  const { pending, run } = useSaver();
  const [form, setForm] = React.useState({ ...policy });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reserva e rendimento</CardTitle>
        <p className="text-fg-muted text-xs">
          Vale para o caixa de quitação — dinheiro que ainda vai entrar. O que já está em conta
          rende pela taxa da própria conta, em <strong>Caixa e caixinhas</strong>. No modo ligado ao
          CDI, a rotina de quinta-feira mexe direto na data de quitação.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => saveYieldPolicy(form), "Premissas de rendimento atualizadas.");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Como calcular o rendimento">
              <Select
                value={form.mode}
                onChange={(event) =>
                  setForm({ ...form, mode: event.target.value as "MANUAL" | "CDI_LINKED" })
                }
              >
                <option value="CDI_LINKED">Ligado ao CDI do último snapshot</option>
                <option value="MANUAL">Percentual fixo que eu digitar</option>
              </Select>
            </Field>
            {form.mode === "MANUAL" ? (
              <Field label="Rendimento líquido ao ano">
                <PercentInput
                  value={form.manualAnnualNet}
                  onChange={(manualAnnualNet) => setForm({ ...form, manualAnnualNet })}
                />
              </Field>
            ) : (
              <>
                <Field label="Percentual do CDI">
                  <PercentInput
                    value={form.cdiPercent}
                    onChange={(cdiPercent) => setForm({ ...form, cdiPercent })}
                  />
                </Field>
                <Field label="IR sobre o rendimento">
                  <PercentInput
                    value={form.incomeTaxRate}
                    onChange={(incomeTaxRate) => setForm({ ...form, incomeTaxRate })}
                  />
                </Field>
              </>
            )}
          </div>

          <label className="rounded-control bg-surface-subtle flex items-start gap-2 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand-primary)]"
              checked={form.accrueInvestments}
              onChange={(event) => setForm({ ...form, accrueInvestments: event.target.checked })}
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">Corrigir as aplicações até o vencimento</span>
              <span className="text-fg-muted text-xs">
                Desligado, cada aplicação entra pelo valor de hoje — é o que a planilha faz. Ligado,
                ela rende até vencer pelo próprio indexador.
              </span>
            </span>
          </label>

          <div className="rounded-control bg-surface-subtle p-3">
            <span className="text-fg-muted text-xs font-semibold">Alvos da reserva</span>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {reserveTargets.map((target) => (
                <li key={target.id} className="flex justify-between">
                  <span className="text-fg-muted">
                    A partir de {formatMonth(target.effectiveFrom as YearMonth)}
                  </span>
                  <span className="font-semibold">{target.months} meses de custo de vida</span>
                </li>
              ))}
            </ul>
          </div>

          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}
