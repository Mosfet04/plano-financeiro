import { describe, expect, it } from "vitest";

import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import {
  closingSlack,
  lastClosedMonth,
  type MonthClosing,
} from "@/core/domain/closing/month-closing.entity";
import { Indexer } from "@/core/domain/investment/investment.entity";
import { projectPlan, type ProjectionInput } from "@/core/domain/projection/project-plan";
import { reais, type Cents } from "@/core/domain/shared/money";
import type { YearMonth } from "@/core/domain/shared/month";
import { spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

function closing(month: string, leftover = 3000, planTarget = 3000): MonthClosing {
  return {
    id: `close-${month}`,
    planId: "plan-planilha",
    month: month as YearMonth,
    leftover: reais(leftover),
    planTarget: reais(planTarget),
    cash: reais(8500),
    closedAt: new Date("2026-10-01T12:00:00Z"),
    note: null,
  };
}

const caixinha: CashAccount = {
  id: "nu",
  planId: "plan-planilha",
  name: "Caixinha Nubank",
  balance: reais(3143),
  indexer: Indexer.CDI_PCT,
  indexerValue: 1,
  taxExempt: false,
  checkedOn: "2026-09-09",
};

function project(over: Partial<ProjectionInput>) {
  return projectPlan({ ...spreadsheetProjectionInput(), ...over });
}

describe("entidade de fechamento", () => {
  it("a folga é a sobra menos a meta", () => {
    expect(closingSlack(closing("2026-09", 3143, 3043))).toBe(reais(100));
    expect(closingSlack(closing("2026-09", 2900, 3043))).toBe(reais(-143));
  });

  it("o último mês fechado não depende da ordem da lista", () => {
    const desordenado = [closing("2026-09"), closing("2026-07"), closing("2026-08")];
    expect(lastClosedMonth(desordenado)).toBe("2026-09");
  });

  it("sem fechamentos não há último mês", () => {
    expect(lastClosedMonth([])).toBeNull();
  });
});

describe("recomeço depois do último mês fechado", () => {
  it("a projeção começa no mês seguinte ao fechado", () => {
    const result = project({ cashAccounts: [caixinha], closings: [closing("2026-09")] });

    expect(result.closedThrough).toBe("2026-09");
    expect(result.startMonth).toBe("2026-10");
    expect(result.months[0].month).toBe("2026-10");
  });

  /**
   * A diferença que motivou a tabela: um mês fechado está inteiro dentro do
   * saldo, então o mês seguinte deposita normalmente. Já o saldo apenas
   * conferido no dia 9 deixa metade do mês em aberto, e esse mês não deposita.
   */
  it("o primeiro mês projetado deposita normalmente", () => {
    const fechado = project({ cashAccounts: [caixinha], closings: [closing("2026-09")] });
    const soConferido = project({ cashAccounts: [caixinha], closings: [] });

    expect(fechado.months[0].toReserve).toBeGreaterThan(0);
    expect(soConferido.months[0].toReserve).toBe(0);
  });

  it("o fechamento vence a data de conferência mesmo sendo mais antigo", () => {
    // Saldo conferido em outubro, mas novembro fechado: manda o fechamento.
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-20" }],
      closings: [closing("2026-11")],
    });

    expect(result.startMonth).toBe("2026-12");
  });

  it("vale o último de vários fechamentos", () => {
    const result = project({
      cashAccounts: [caixinha],
      closings: [closing("2026-08"), closing("2026-10"), closing("2026-09")],
    });

    expect(result.startMonth).toBe("2026-11");
  });

  it("fechamento anterior ao início do plano não puxa a projeção para trás", () => {
    const planStart = spreadsheetProjectionInput().startMonth;
    const result = project({ closings: [closing("2026-05")] });

    expect(result.startMonth).toBe(planStart);
  });

  it("o caixa de abertura continua vindo das contas, não do fechamento", () => {
    // `cash` do fechamento é R$ 8.500 e a conta tem R$ 3.143: manda a conta,
    // porque ela é o saldo de hoje e o fechamento é história congelada.
    const result = project({ cashAccounts: [caixinha], closings: [closing("2026-09")] });
    expect(result.openingCash).toBe(reais(3143));
  });

  it("sem fechamento e sem conta o plano roda desde o início", () => {
    const planStart = spreadsheetProjectionInput().startMonth;
    const result = project({});

    expect(result.startMonth).toBe(planStart);
    expect(result.closedThrough).toBeNull();
    expect(result.settledOn).toBeNull();
  });
});

describe("saldo devedor atravessa os meses fechados", () => {
  const monthsFrom = (start: string, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const [y, m] = start.split("-").map(Number);
      const total = y * 12 + (m - 1) + i;
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    });

  /**
   * `principal` é o valor da assinatura do contrato, não o saldo de hoje. Sem a
   * passada de alcance, cada mês fechado devolvia uma parcela ao saldo devedor:
   * quatro meses valiam R$ 2.476 de dívida inexistente e quase um ano a mais de
   * quitação. A primeira parcela do plano é dez/2026.
   */
  it.each([1, 4, 12, 24])(
    "com %i mês(es) fechado(s) a dívida bate com a projeção contínua",
    (n) => {
      const closings = monthsFrom("2026-12", n).map((m) => closing(m));
      const rebased = project({ closings });
      const continuous = project({});

      const reference = continuous.months.find((m) => m.month === rebased.startMonth);
      expect(reference, `mês ${rebased.startMonth} fora do horizonte`).toBeDefined();
      expect(rebased.months[0].debt).toBe(reference!.debt);
      expect(rebased.months[0].installment).toBe(reference!.installment);
    }
  );

  it("mês fechado antes da primeira parcela não mexe na dívida", () => {
    // Fechar out/2026 é antes de dez/2026: nada foi amortizado ainda.
    const rebased = project({ closings: [closing("2026-10")] });
    const continuous = project({});
    const reference = continuous.months.find((m) => m.month === "2026-11")!;

    expect(rebased.months[0].debt).toBe(reference.debt);
    expect(rebased.months[0].installment).toBe(0);
  });
});

describe("conferência no dia 1º", () => {
  /**
   * O fluxo humano: no dia 1º de outubro você fecha setembro e confere os
   * saldos. Nada de outubro está no saldo ainda, então outubro deposita
   * inteiro. Tratar o dia 1º como "mês parcialmente vivido" custaria a sobra
   * inteira do mês — e é o jeito mais natural de fazer o fechamento.
   */
  it("saldo conferido no dia 1º deixa o mês depositar inteiro", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-01" }],
      closings: [closing("2026-09")],
    });

    expect(result.startMonth).toBe("2026-10");
    expect(result.months[0].toReserve).toBeGreaterThan(0);
  });

  it("do dia 2 em diante o mês não deposita", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-02" }],
      closings: [closing("2026-09")],
    });

    expect(result.startMonth).toBe("2026-10");
    expect(result.months[0].toReserve).toBe(0);
  });

  it("dia 1º sem nenhum fechamento também deposita inteiro", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-01" }],
      closings: [],
    });

    expect(result.startMonth).toBe("2026-10");
    expect(result.months[0].toReserve).toBeGreaterThan(0);
  });
});

describe("aplicações contra o mês fechado", () => {
  it("aplicação vencida dentro do mês fechado não entra de novo", () => {
    // A LCI do BRB vence em 08/09/2026, dentro de setembro.
    const result = project({ cashAccounts: [caixinha], closings: [closing("2026-09")] });
    const total = result.months.reduce((sum, m) => sum + m.maturedInvestments, 0);
    const semFechamento = project({ closings: [] }).months.reduce(
      (sum, m) => sum + m.maturedInvestments,
      0
    );

    expect(total).toBeLessThan(semFechamento);
  });

  it("aplicação que vence depois do mês fechado continua entrando", () => {
    // O CDB Digimais vence em 09/11/2026.
    const result = project({ cashAccounts: [caixinha], closings: [closing("2026-09")] });
    const novembro = result.months.find((m) => m.month === "2026-11")!;

    expect(novembro.maturedInvestments).toBeGreaterThan(0);
  });

  /**
   * Regressão: fechar agosto não pode "descongelar" o que o saldo conferido em
   * 09/09 já contém. A liquidação vale até a data MAIS RECENTE entre o fim do
   * mês fechado e a conferência — senão a LCI que venceu em 08/09 entraria de
   * novo, mesmo já estando dentro da caixinha.
   */
  it("fechar um mês antigo não ressuscita aplicação já embutida no saldo", () => {
    const conferidoEm09 = { ...caixinha, checkedOn: "2026-09-09" };

    const semFechamento = project({ cashAccounts: [conferidoEm09], closings: [] });
    const comAgostoFechado = project({
      cashAccounts: [conferidoEm09],
      closings: [closing("2026-08")],
    });

    const totalMaturities = (r: ReturnType<typeof project>) =>
      r.months.reduce((sum, m) => sum + m.maturedInvestments, 0);

    expect(comAgostoFechado.settledOn).toBe("2026-09-09");
    expect(totalMaturities(comAgostoFechado)).toBe(totalMaturities(semFechamento));
  });

  it("o corte é o fim do mês fechado, não o dia da conferência", () => {
    // Conferido em 09/09, fechado setembro: uma aplicação que vencesse em 20/09
    // está dentro do mês fechado e não pode entrar de novo.
    const base = spreadsheetProjectionInput();
    const investments = [
      ...base.investments,
      {
        id: "tarde",
        planId: "plan-planilha",
        name: "CDB que venceu no fim de setembro",
        amount: reais(5000) as Cents,
        maturityDate: "2026-09-20",
        indexer: Indexer.CDI_PCT,
        indexerValue: 1,
        taxExempt: false,
        instruction: null,
      },
    ];

    const soConferido = projectPlan({ ...base, investments, cashAccounts: [caixinha] });
    const fechado = projectPlan({
      ...base,
      investments,
      cashAccounts: [caixinha],
      closings: [closing("2026-09")],
    });

    const setembro = soConferido.months.find((m) => m.month === "2026-09")!;
    expect(setembro.maturedInvestments).toBe(reais(5000));
    expect(fechado.months.every((m) => m.maturedInvestments !== reais(5000))).toBe(true);
  });
});
