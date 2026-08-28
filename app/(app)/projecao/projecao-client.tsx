"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatBRL, toReais, type Cents } from "@/core/domain/shared/money";
import { formatMonth, type YearMonth } from "@/core/domain/shared/month";
import { cn } from "@/lib/utils";

export interface ProjectionRow {
  month: YearMonth;
  housing: number;
  otherFixed: number;
  variable: number;
  goals: number;
  income: number;
  leftover: number;
  maturedInvestments: number;
  reserve: number;
  payoffCash: number;
  debt: number;
  canPayOff: boolean;
}

const COLUMNS: ReadonlyArray<{ key: keyof ProjectionRow; label: string }> = [
  { key: "income", label: "Renda" },
  { key: "housing", label: "Moradia" },
  { key: "otherFixed", label: "Outras fixas" },
  { key: "variable", label: "Variáveis" },
  { key: "goals", label: "Metas" },
  { key: "leftover", label: "Sobrou" },
  { key: "maturedInvestments", label: "Venceu" },
  { key: "reserve", label: "Reserva" },
  { key: "payoffCash", label: "Caixa" },
  { key: "debt", label: "Falta pagar" },
];

export function ProjecaoClient({
  rows,
  payoffMonth,
}: {
  rows: readonly ProjectionRow[];
  payoffMonth: YearMonth | null;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? rows : rows.slice(0, 18);

  const chartData = React.useMemo(
    () =>
      rows.map((row) => ({
        mes: formatMonth(row.month),
        Reserva: toReais(row.reserve as Cents),
        "Caixa de quitação": toReais(row.payoffCash as Cents),
        "Saldo devedor": toReais(row.debt as Cents),
      })),
    [rows]
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Reserva, caixa e dívida</CardTitle>
          <p className="text-fg-muted text-xs">
            A quitação acontece quando a linha do caixa cruza a do saldo devedor
            {payoffMonth ? ` — em ${formatMonth(payoffMonth)}.` : "."}
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--stroke-subtle)" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  stroke="var(--stroke)"
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  stroke="var(--stroke)"
                  tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--stroke)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                  formatter={(value) =>
                    typeof value === "number" ? `R$ ${formatAmount((value * 100) as Cents)}` : "—"
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="Reserva"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Caixa de quitação"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Saldo devedor"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Mês a mês</CardTitle>
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="text-brand text-xs font-semibold hover:underline"
          >
            {showAll ? "Mostrar menos" : `Mostrar todos os ${rows.length} meses`}
          </button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {/* A tabela rola sozinha; a página nunca rola na horizontal. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-xs">
              <thead>
                <tr className="border-stroke-subtle text-fg-muted border-b">
                  <th className="bg-surface sticky left-0 px-4 py-2 text-left font-semibold">
                    Mês
                  </th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className="px-3 py-2 text-right font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.month}
                    className={cn(
                      "border-stroke-subtle border-b last:border-0",
                      row.payoffCash < 0 && "bg-danger-bg"
                    )}
                  >
                    <td className="bg-surface sticky left-0 px-4 py-2 font-semibold whitespace-nowrap">
                      {formatMonth(row.month)}
                      {row.canPayOff ? (
                        <Badge tone="success" className="ml-2">
                          quita
                        </Badge>
                      ) : null}
                    </td>
                    {COLUMNS.map((column) => {
                      const value = row[column.key] as number;
                      return (
                        <td
                          key={column.key}
                          className={cn(
                            "tabular px-3 py-2 text-right whitespace-nowrap",
                            value < 0 && "text-danger"
                          )}
                        >
                          {formatBRL(value as Cents)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
