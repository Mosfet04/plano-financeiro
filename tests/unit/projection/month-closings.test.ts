import { describe, expect, it } from "vitest";

import type { CashAccount } from "@/core/domain/cash/cash-account.entity";
import {
  closingSlack,
  isMonthOver,
  lastClosedMonth,
  pendingTurnover,
  type MonthClosing,
} from "@/core/domain/closing/month-closing.entity";
import { Indexer } from "@/core/domain/investment/investment.entity";
import {
  expectedLeftover,
  projectPlan,
  type ProjectionInput,
} from "@/core/domain/projection/project-plan";
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

describe("quando a virada abre", () => {
  const SET = "2026-09" as YearMonth;

  it("mês anterior ao corrente já acabou", () => {
    expect(isMonthOver(SET, "2026-10-01")).toBe(true);
    expect(isMonthOver(SET, "2026-12-20")).toBe(true);
  });

  /** O último dia é quando o salário costuma cair e a sobra vai para as caixinhas. */
  it("o mês corrente abre no último dia", () => {
    expect(isMonthOver(SET, "2026-09-30")).toBe(true);
    expect(isMonthOver(SET, "2026-09-29")).toBe(false);
    expect(isMonthOver(SET, "2026-09-01")).toBe(false);
  });

  it("mês futuro não acabou", () => {
    expect(isMonthOver("2026-11" as YearMonth, "2026-10-31")).toBe(false);
  });
});

describe("virada pendente", () => {
  const INICIO = "2026-08" as YearMonth;

  it("no dia 1º é a do mês que acabou de terminar", () => {
    expect(pendingTurnover("2026-10-01", [], INICIO)).toBe("2026-09");
  });

  it("no último dia já é a do próprio mês", () => {
    expect(pendingTurnover("2026-09-30", [], INICIO)).toBe("2026-09");
  });

  it("some quando o mês está fechado", () => {
    expect(pendingTurnover("2026-10-01", [closing("2026-09")], INICIO)).toBeNull();
  });

  /** Os saldos de hoje já contêm o mês velho; quem resolve é fechar o recente. */
  it("um mês velho aberto não volta a pedir virada", () => {
    expect(pendingTurnover("2026-11-10", [closing("2026-10")], INICIO)).toBeNull();
  });

  it("antes do início do plano não há virada", () => {
    expect(pendingTurnover("2026-08-15", [], INICIO)).toBeNull();
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

  it("sem o mês anterior fechado, do dia 2 em diante o mês não deposita", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-02" }],
      closings: [],
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

describe("virada feita depois do dia 1º", () => {
  /**
   * Fechar setembro é dizer "a sobra dele foi para as caixinhas, a de outubro
   * ainda não". Quem faz a virada no dia 5 confere saldos que não têm nada de
   * outubro — descartar a sobra de outubro aí era perder um mês inteiro.
   */
  it("com o mês anterior fechado, conferir no dia 5 ainda deposita o mês inteiro", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-05" }],
      closings: [closing("2026-09")],
    });

    expect(result.startMonth).toBe("2026-10");
    expect(result.months[0].toReserve).toBeGreaterThan(0);
  });

  it("e deposita o mesmo que a virada feita no dia 1º", () => {
    const noDia1 = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-01" }],
      closings: [closing("2026-09")],
    });
    const noDia5 = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-05" }],
      closings: [closing("2026-09")],
    });

    expect(noDia5.months[0].toReserve).toBe(noDia1.months[0].toReserve);
    expect(noDia5.minCash).toBe(noDia1.minCash);
  });

  it("fechar um mês mais antigo que o anterior não destrava o depósito", () => {
    // Agosto fechado, setembro não, saldo de 05/10: outubro está pela metade.
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-05" }],
      closings: [closing("2026-08")],
    });

    expect(result.startMonth).toBe("2026-10");
    expect(result.months[0].toReserve).toBe(0);
  });
});

describe("saldo conferido depois do último fechamento", () => {
  /**
   * Setembro fechado e saldo conferido em 15/11: outubro já está dentro do
   * saldo. Recomeçar em outubro, como o fechamento sozinho mandaria, contaria
   * a sobra de outubro duas vezes.
   */
  it("recomeça no mês do saldo, não no seguinte ao fechado", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-11-15" }],
      closings: [closing("2026-09")],
    });

    expect(result.startMonth).toBe("2026-11");
    expect(result.months.some((m) => m.month === "2026-10")).toBe(false);
  });

  it("e esse mês, conferido pela metade e sem o anterior fechado, não deposita", () => {
    const result = project({
      cashAccounts: [{ ...caixinha, checkedOn: "2026-11-15" }],
      closings: [closing("2026-09")],
    });

    expect(result.months[0].toReserve).toBe(0);
  });
});

describe("sobra esperada de um mês", () => {
  const continuous = () => project({});

  /**
   * É a meta do fechamento. Depois que você confere os saldos em 01/10, a
   * projeção começa em outubro e setembro sai dela — a meta de setembro não
   * pode virar a sobra de outubro.
   */
  it("mês que já saiu da projeção mantém a sobra que o plano esperava dele", () => {
    const input = {
      ...spreadsheetProjectionInput(),
      cashAccounts: [{ ...caixinha, checkedOn: "2026-10-01" }],
      closings: [closing("2026-08")],
    };
    const result = projectPlan(input);
    const setembro = continuous().months.find((m) => m.month === "2026-09")!;

    expect(result.months.some((m) => m.month === "2026-09")).toBe(false);
    expect(expectedLeftover(input, "2026-09" as YearMonth)).toBe(setembro.leftover);
  });

  it("não depende do caixa nem dos fechamentos posteriores", () => {
    const comCaixa = {
      ...spreadsheetProjectionInput(),
      cashAccounts: [{ ...caixinha, balance: reais(80_000) }],
      closings: [closing("2026-10"), closing("2026-11")],
    };
    const outubro = continuous().months.find((m) => m.month === "2026-10")!;

    expect(expectedLeftover(comCaixa, "2026-10" as YearMonth)).toBe(outubro.leftover);
  });

  it("mês ainda na projeção devolve a mesma sobra da linha", () => {
    const input = { ...spreadsheetProjectionInput(), cashAccounts: [caixinha] };
    const linha = projectPlan(input).months.find((m) => m.month === "2026-10")!;

    expect(expectedLeftover(input, "2026-10" as YearMonth)).toBe(linha.leftover);
  });

  it("mês anterior ao início do plano não tem meta", () => {
    expect(expectedLeftover(spreadsheetProjectionInput(), "2026-01" as YearMonth)).toBeNull();
  });

  it("mês além do horizonte padrão ainda é calculado", () => {
    const input = { ...spreadsheetProjectionInput(), horizonMonths: 12 };
    expect(expectedLeftover(input, "2030-06" as YearMonth)).not.toBeNull();
  });
});
