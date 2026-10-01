import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import { isMonthOver, type MonthClosing } from "@/core/domain/closing/month-closing.entity";
import type { Investment } from "@/core/domain/investment/investment.entity";
import type { PlanSnapshot } from "@/core/domain/plan/plan-snapshot";
import { projectPlan, type ProjectionSummary } from "@/core/domain/projection/project-plan";
import { estimatedYieldBetween, totalCashBalance } from "@/core/domain/projection/yield";
import { addCents, ZERO, type Cents } from "@/core/domain/shared/money";
import { formatMonth, monthOfISODate, type YearMonth } from "@/core/domain/shared/month";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";

import type {
  Clock,
  IdGenerator,
  MonthClosingRepository,
  MonthTurnover,
  PlanRepository,
} from "../ports";
import type { CloseMonthOutput, CloseMonthUseCase } from "./close-month.use-case";
import { buildProjectionInput, DEFAULT_HORIZON_MONTHS } from "./get-projection.use-case";

/** O saldo de uma conta como aparece no app do banco no dia da virada. */
export interface ConferredBalance {
  readonly accountId: string;
  readonly balance: Cents;
}

export interface SettleMonthInput {
  readonly planId: string;
  readonly month: YearMonth;
  /** Uma entrada por conta de caixa do plano — todas, não só as que mudaram. */
  readonly balances: readonly ConferredBalance[];
  /** Aplicações vencidas cujo dinheiro já está dentro dos saldos acima. */
  readonly redeemedInvestmentIds?: readonly string[];
  /** Saldo do FGTS conferido no app da CAIXA. Omitido ou nulo = não mexe. */
  readonly fgtsBalance?: Cents | null;
  readonly note?: string | null;
}

export interface AccountReview {
  readonly account: CashAccount;
  /** Quanto a conta deve ter rendido desde a última conferência. */
  readonly estimatedYield: Cents;
  /**
   * Saldo anterior + rendimento. Não inclui a sobra do mês: ela pode ter ido
   * para qualquer conta, e só você sabe para qual.
   */
  readonly expected: Cents;
}

/** Tudo que a tela da virada precisa para guiar a conferência. */
export interface SettlementReview {
  readonly month: YearMonth;
  /** Data em que os saldos ficam conferidos: hoje. */
  readonly checkedOn: string;
  readonly summary: CloseMonthOutput;
  readonly accounts: readonly AccountReview[];
  /** Aplicações que já venceram: o dinheiro delas devia estar nas caixinhas. */
  readonly maturedInvestments: readonly Investment[];
  /** Nulo quando o FGTS está desligado no plano. */
  readonly fgts: { readonly balance: Cents } | null;
  /** O fechamento que já existe para o mês, quando é uma virada refeita. */
  readonly existing: MonthClosing | null;
}

/** Os números da capa, para mostrar o que a virada muda no plano. */
export interface ProjectionHeadline {
  readonly startMonth: YearMonth;
  readonly openingCash: Cents;
  readonly payoffMonth: YearMonth | null;
  readonly minCash: Cents;
  readonly minCashMonth: YearMonth | null;
}

export interface SettlementPreview {
  readonly before: ProjectionHeadline;
  readonly after: ProjectionHeadline;
}

function headline(projection: ProjectionSummary): ProjectionHeadline {
  return {
    startMonth: projection.startMonth,
    openingCash: projection.openingCash,
    payoffMonth: projection.payoffMonth,
    minCash: projection.minCash,
    minCashMonth: projection.minCashMonth,
  };
}

/**
 * A virada do mês: confere os saldos, congela o que o mês foi e o tira do
 * caminho da projeção — tudo de uma vez.
 *
 * Era um botão em /mes e um formulário em /premissas, e a ordem entre os dois
 * importava sem ninguém dizer: fechar sem atualizar os saldos fazia a sobra do
 * mês sumir do plano, e atualizar sem fechar no dia 2 em diante fazia o mês
 * seguinte não depositar. Juntos, nenhuma das duas coisas acontece.
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

  /** O que a tela mostra antes de você digitar qualquer coisa. */
  async review(input: { planId: string; month: YearMonth }): Promise<Result<SettlementReview>> {
    const loaded = await this.load(input.planId, input.month);
    if (!loaded.ok) return loaded;
    const snapshot = loaded.value;

    const summary = await this.closeMonth.execute(input);
    if (!summary.ok) return summary;

    const today = this.clock.today();
    const taxRate = snapshot.yieldPolicy.incomeTaxRate;

    return ok({
      month: input.month,
      checkedOn: today,
      summary: summary.value,
      accounts: snapshot.cashAccounts.map((account) => {
        const estimatedYield = estimatedYieldBetween(
          account,
          snapshot.rates,
          taxRate,
          account.checkedOn,
          today
        );
        return { account, estimatedYield, expected: addCents(account.balance, estimatedYield) };
      }),
      maturedInvestments: snapshot.investments.filter((inv) => inv.maturityDate <= today),
      fgts: snapshot.fgts?.enabled ? { balance: snapshot.fgts.balance } : null,
      existing: snapshot.closings.find((closing) => closing.month === input.month) ?? null,
    });
  }

  /** Quitação e menor caixa antes e depois, sem gravar nada. */
  async preview(input: SettleMonthInput): Promise<Result<SettlementPreview>> {
    const loaded = await this.load(input.planId, input.month);
    if (!loaded.ok) return loaded;
    const snapshot = loaded.value;

    // O motor só lê o mês do fechamento; os valores congelados não mudam a conta.
    const turnover = this.buildTurnover(snapshot, input, { leftover: ZERO, planTarget: ZERO });
    if (!turnover.ok) return turnover;

    const today = this.clock.today();
    const project = (s: PlanSnapshot) =>
      projectPlan(buildProjectionInput(s, today, DEFAULT_HORIZON_MONTHS));

    return ok({
      before: headline(project(snapshot)),
      after: headline(project(applyTurnover(snapshot, turnover.value))),
    });
  }

  async execute(input: SettleMonthInput): Promise<Result<MonthClosing>> {
    const loaded = await this.load(input.planId, input.month);
    if (!loaded.ok) return loaded;
    const snapshot = loaded.value;

    const summary = await this.closeMonth.execute(input);
    if (!summary.ok) return summary;

    const turnover = this.buildTurnover(snapshot, input, summary.value);
    if (!turnover.ok) return turnover;

    await this.closings.settle(turnover.value);
    return ok(turnover.value.closing);
  }

  private async load(planId: string, month: YearMonth): Promise<Result<PlanSnapshot>> {
    const today = this.clock.today();
    if (month > monthOfISODate(today)) {
      return err(new DomainError("MONTH_IN_FUTURE", "Esse mês ainda não começou."));
    }
    // Fechar mês que ainda não acabou congelaria um número que ainda vai mudar,
    // e pior: tiraria da projeção uma sobra que ainda está por vir.
    if (!isMonthOver(month, today)) {
      return err(
        new DomainError(
          "MONTH_NOT_OVER",
          `${formatMonth(month)} ainda não terminou. A virada abre no último dia do mês.`
        )
      );
    }

    const snapshot = await this.plans.loadSnapshot(planId);
    if (!snapshot) {
      return err(new DomainError("PLAN_NOT_FOUND", "Plano não encontrado."));
    }
    // Fechar manda a projeção partir do saldo das contas. Sem nenhuma, o saldo é
    // zero e todo o dinheiro já guardado some do plano.
    if (snapshot.cashAccounts.length === 0) {
      return err(
        new DomainError(
          "NO_CASH_ACCOUNTS",
          "Cadastre onde seu dinheiro está (Premissas → Caixa e caixinhas) antes da virada."
        )
      );
    }

    return ok(snapshot);
  }

  private buildTurnover(
    snapshot: PlanSnapshot,
    input: SettleMonthInput,
    frozen: Pick<MonthClosing, "leftover" | "planTarget">
  ): Result<MonthTurnover> {
    const today = this.clock.today();

    const conferred = new Map<string, Cents>();
    for (const entry of input.balances) {
      if (conferred.has(entry.accountId)) {
        return err(new DomainError("DUPLICATE_BALANCE", "Cada conta aparece uma vez só."));
      }
      if (!snapshot.cashAccounts.some((account) => account.id === entry.accountId)) {
        return err(new DomainError("UNKNOWN_ACCOUNT", "Conta não encontrada no seu plano."));
      }
      if (entry.balance < 0) {
        return err(new DomainError("INVALID_BALANCE", "Saldo não pode ser negativo."));
      }
      conferred.set(entry.accountId, entry.balance);
    }

    // Todas, não só as que mudaram: a data da conferência vale para o caixa
    // inteiro, e uma conta esquecida ficaria com o saldo de um mês atrás.
    const missing = snapshot.cashAccounts.filter((account) => !conferred.has(account.id));
    if (missing.length > 0) {
      return err(
        new DomainError(
          "MISSING_BALANCE",
          `Confira também: ${missing.map((account) => account.name).join(", ")}.`
        )
      );
    }

    const redeemed = [...new Set(input.redeemedInvestmentIds ?? [])];
    for (const id of redeemed) {
      const investment = snapshot.investments.find((inv) => inv.id === id);
      if (!investment) {
        return err(new DomainError("UNKNOWN_INVESTMENT", "Aplicação não encontrada no seu plano."));
      }
      if (investment.maturityDate > today) {
        return err(
          new DomainError("INVESTMENT_NOT_MATURED", `${investment.name} ainda não venceu.`)
        );
      }
    }

    const accounts = snapshot.cashAccounts.map((account) => ({
      ...account,
      balance: conferred.get(account.id)!,
      checkedOn: today,
    }));

    const existing = snapshot.closings.find((closing) => closing.month === input.month);

    return ok({
      closing: {
        id: existing?.id ?? this.ids.generate(),
        planId: snapshot.plan.id,
        month: input.month,
        leftover: frozen.leftover,
        planTarget: frozen.planTarget,
        cash: totalCashBalance(accounts),
        closedAt: this.clock.now(),
        note: input.note ?? null,
      },
      accounts,
      redeemedInvestmentIds: redeemed,
      fgtsBalance: snapshot.fgts?.enabled ? (input.fgtsBalance ?? null) : null,
    });
  }
}

/** O plano como fica depois da virada — para a prévia, sem passar pelo banco. */
function applyTurnover(snapshot: PlanSnapshot, turnover: MonthTurnover): PlanSnapshot {
  const redeemed = new Set(turnover.redeemedInvestmentIds);
  return {
    ...snapshot,
    cashAccounts: turnover.accounts,
    closings: [
      ...snapshot.closings.filter((closing) => closing.month !== turnover.closing.month),
      turnover.closing,
    ],
    investments: snapshot.investments.filter((inv) => !redeemed.has(inv.id)),
    fgts:
      snapshot.fgts && turnover.fgtsBalance !== null
        ? { ...snapshot.fgts, balance: turnover.fgtsBalance }
        : snapshot.fgts,
  };
}
