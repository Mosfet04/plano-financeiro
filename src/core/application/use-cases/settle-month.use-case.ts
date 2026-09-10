import type { MonthClosing } from "@/core/domain/closing/month-closing.entity";
import { totalCashBalance } from "@/core/domain/projection/yield";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";
import { monthOfISODate, type YearMonth } from "@/core/domain/shared/month";

import type { Clock, IdGenerator, MonthClosingRepository, PlanRepository } from "../ports";
import type { CloseMonthUseCase } from "./close-month.use-case";

export interface SettleMonthInput {
  readonly planId: string;
  readonly month: YearMonth;
  readonly note?: string | null;
}

/**
 * Fecha um mês: congela o que ele foi e o tira do caminho da projeção.
 *
 * A conta em si já existe em `CloseMonthUseCase` — a tela do mês mostra os
 * mesmos números o tempo todo. O que este caso de uso acrescenta é o registro:
 * a partir dele o mês é história, e a projeção recomeça no seguinte em vez de
 * replayar as premissas por cima de um caixa que já contém o resultado.
 *
 * Congela em vez de recalcular de propósito. Daqui a um ano, mexer no orçamento
 * de mercado não pode reescrever o que setembro de 2026 foi — e é justamente a
 * comparação entre o congelado e o previsto que forma a série "previu × fiz".
 */
export class SettleMonthUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly closeMonth: CloseMonthUseCase,
    private readonly closings: MonthClosingRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async execute(input: SettleMonthInput): Promise<Result<MonthClosing>> {
    // Fechar mês que ainda não acabou congelaria um número que ainda vai mudar,
    // e pior: tiraria da projeção uma sobra que ainda está por vir.
    const currentMonth = monthOfISODate(this.clock.today());
    if (input.month > currentMonth) {
      return err(new DomainError("MONTH_IN_FUTURE", "Esse mês ainda não começou."));
    }

    const snapshot = await this.plans.loadSnapshot(input.planId);
    if (!snapshot) {
      return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));
    }

    const result = await this.closeMonth.execute(input);
    if (!result.ok) return result;

    const existing = await this.closings.findByMonth(input.planId, input.month);
    const closing: MonthClosing = {
      id: existing?.id ?? this.ids.generate(),
      planId: input.planId,
      month: input.month,
      leftover: result.value.leftover,
      planTarget: result.value.planTarget,
      cash: totalCashBalance(snapshot.cashAccounts),
      closedAt: this.clock.now(),
      note: input.note ?? null,
    };

    await this.closings.save(closing);
    return ok(closing);
  }
}
