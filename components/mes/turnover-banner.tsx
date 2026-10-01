import { CalendarCheck, ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatMonth, monthOfISODate, type YearMonth } from "@/core/domain/shared/month";

/**
 * O lembrete da virada. Aparece em /resumo e /mes enquanto o mês que acabou
 * de terminar estiver aberto — é o que tira o "fechar o mês" da memória.
 */
export function TurnoverBanner({ month, today }: { month: YearMonth; today: string }) {
  const endsToday = monthOfISODate(today) === month;

  return (
    <Link
      href={`/mes/virada?mes=${month}`}
      className="rounded-card border-brand bg-brand-tint hover:bg-surface-hover flex items-center gap-3 border p-4 transition-colors"
    >
      <CalendarCheck className="text-brand size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold">
          {endsToday
            ? `${formatMonth(month)} termina hoje: hora da virada`
            : `${formatMonth(month)} terminou: falta fazer a virada`}
        </p>
        <p className="text-fg-muted text-xs">
          Confira os saldos das caixinhas no app do banco e feche o mês. Leva dois minutos, e é o
          que faz o plano partir do dinheiro que você tem de verdade.
        </p>
      </div>
      <ChevronRight className="text-fg-muted size-5 shrink-0" />
    </Link>
  );
}
