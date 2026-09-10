import { describe, expect, it } from "vitest";

import { AmortizationSystem, type Financing } from "@/core/domain/financing/financing.entity";
import {
  amortizationFor,
  interestOn,
  monthlyInterestRate,
  priceInstallment,
  termAfterExtraAmortization,
} from "@/core/domain/projection/amortization";
import { projectPlan, type ProjectionInput } from "@/core/domain/projection/project-plan";
import { reais, type Cents } from "@/core/domain/shared/money";
import { spreadsheetProjectionInput } from "../../fixtures/plano-da-planilha";

const base = spreadsheetProjectionInput();
const contract = base.financing!;
const rate = monthlyInterestRate(contract.annualInterest);

function withFinancing(over: Partial<Financing>, input: Partial<ProjectionInput> = {}) {
  return projectPlan({ ...base, ...input, financing: { ...contract, ...over } });
}

/** Roda um contrato inteiro até quitar, devolvendo cada mês. */
function schedule(
  system: "SAC" | "PRICE",
  principal: Cents,
  monthlyRate: number,
  termMonths: number
) {
  const rows: Array<{ balance: Cents; amortization: Cents; installment: Cents }> = [];
  let balance = principal;
  let remaining = termMonths;

  while (balance > 0 && remaining > 0 && rows.length < termMonths + 5) {
    const amortization = amortizationFor(system, balance, monthlyRate, remaining);
    const interest = interestOn(balance, monthlyRate);
    rows.push({ balance, amortization, installment: (interest + amortization) as Cents });
    balance = (balance - amortization) as Cents;
    remaining -= 1;
  }
  return rows;
}

describe("matemática dos dois sistemas", () => {
  it("SAC mantém a amortização constante", () => {
    const rows = schedule("SAC", reais(120_000), rate, 120);
    const first = rows[0].amortization;

    expect(rows).toHaveLength(120);
    for (const row of rows) expect(Math.abs(row.amortization - first)).toBeLessThanOrEqual(100);
  });

  it("SAC tem parcela decrescente", () => {
    const rows = schedule("SAC", reais(120_000), rate, 120);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].installment).toBeLessThan(rows[i - 1].installment);
    }
  });

  it("PRICE mantém a parcela constante", () => {
    const rows = schedule("PRICE", reais(120_000), rate, 120);
    const first = rows[0].installment;

    expect(rows).toHaveLength(120);
    for (const row of rows) expect(Math.abs(row.installment - first)).toBeLessThanOrEqual(100);
  });

  it("PRICE tem amortização crescente", () => {
    const rows = schedule("PRICE", reais(120_000), rate, 120);
    expect(rows.at(-1)!.amortization).toBeGreaterThan(rows[0].amortization);
  });

  it("os dois quitam o saldo dentro do prazo", () => {
    for (const system of ["SAC", "PRICE"] as const) {
      const rows = schedule(system, reais(120_000), rate, 120);
      const last = rows.at(-1)!;
      const remaining = last.balance - last.amortization;
      expect(Math.abs(remaining), system).toBeLessThanOrEqual(reais(1));
    }
  });

  /**
   * O bug que a derivação por (saldo, prazo) resolve: guardando a parcela do
   * contrato, a correção monetária fazia os juros passarem a parcela e a
   * amortização virava negativa — saldo devedor crescendo sozinho.
   */
  it("PRICE nunca amortiza negativo, mesmo com juros altos", () => {
    const juros = monthlyInterestRate(0.5);
    const amortization = amortizationFor("PRICE", reais(200_000), juros, 2);
    expect(amortization).toBeGreaterThanOrEqual(0);
  });

  it("priceInstallment sem juros é o principal dividido pelo prazo", () => {
    expect(priceInstallment(reais(12_000), 0, 12)).toBe(reais(1000));
  });

  it("prazo zero ou saldo zero não amortiza nada", () => {
    expect(amortizationFor("PRICE", reais(1000), rate, 0)).toBe(0);
    expect(amortizationFor("SAC", 0 as Cents, rate, 12)).toBe(0);
  });
});

describe("prazo depois da amortização extra", () => {
  it("PRICE: encurta o prazo mantendo a parcela", () => {
    const balance = reais(100_000);
    const installment = priceInstallment(balance, rate, 240);
    const shortened = termAfterExtraAmortization("PRICE", reais(70_000), rate, 240, installment);

    expect(shortened).toBeLessThan(240);
    // Com a parcela mantida sobre um saldo 30% menor, o novo prazo devolve
    // aproximadamente a mesma parcela.
    const recalculated = priceInstallment(reais(70_000), rate, shortened);
    expect(Math.abs(recalculated - installment)).toBeLessThan(reais(30));
  });

  it("SAC: encurta o prazo mantendo a amortização", () => {
    const shortened = termAfterExtraAmortization("SAC", reais(70_000), rate, 240, reais(500));
    expect(shortened).toBe(140);
  });

  it("parcela que não cobre nem os juros mantém o prazo", () => {
    const shortened = termAfterExtraAmortization("PRICE", reais(200_000), rate, 240, reais(10));
    expect(shortened).toBe(240);
  });

  it("saldo quitado zera o prazo", () => {
    expect(termAfterExtraAmortization("PRICE", 0 as Cents, rate, 240, reais(1000))).toBe(0);
  });
});

describe("os dois sistemas dentro da projeção", () => {
  const monthsWithInstallment = (r: ReturnType<typeof projectPlan>) =>
    r.months.filter((m) => m.installment > 0);

  it("SAC: parcela cai mês a mês", () => {
    const rows = monthsWithInstallment(withFinancing({ system: AmortizationSystem.SAC }));
    expect(rows.length).toBeGreaterThan(12);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].installment).toBeLessThanOrEqual(rows[i - 1].installment);
    }
  });

  it("PRICE: parcela constante e menor que a primeira da SAC", () => {
    const sac = monthsWithInstallment(withFinancing({ system: AmortizationSystem.SAC }));
    const price = monthsWithInstallment(withFinancing({ system: AmortizationSystem.PRICE }));

    expect(price[0].installment).toBeLessThan(sac[0].installment);
    for (const row of price) {
      expect(Math.abs(row.installment - price[0].installment)).toBeLessThanOrEqual(reais(1));
    }
  });

  it("PRICE alivia o caixa no começo, que é o ponto de trocar", () => {
    const sac = withFinancing({ system: AmortizationSystem.SAC });
    const price = withFinancing({ system: AmortizationSystem.PRICE });

    expect(price.minCash).toBeGreaterThan(sac.minCash);
  });

  it("SAC com TR ligada continua com dívida decrescente", () => {
    const result = withFinancing({
      system: AmortizationSystem.SAC,
      applyReferenceRate: true,
    });
    const rows = result.months.filter((m) => m.installment > 0);

    expect(rows.length).toBeGreaterThan(12);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].debt, `em ${rows[i].month}`).toBeLessThan(rows[i - 1].debt);
    }
  });

  /**
   * A armadilha de trocar para PRICE num contrato longo com correção monetária.
   *
   * A amortização da PRICE começa minúscula — uns R$ 123 no primeiro mês de um
   * contrato de 420 meses — e a TR corrige o saldo em uns R$ 444. A diferença é
   * saldo devedor que SOBE, ano após ano. A SAC não sofre disso porque amortiza
   * R$ 620 desde o primeiro mês, mais que a correção.
   *
   * Isto não é defeito do motor: a amortização segue positiva (a parcela cobre
   * os juros), e o saldo cresce porque a correção é maior que ela. É o contrato
   * que é assim, e por isso a tela avisa quando as duas opções estão ligadas.
   */
  it("PRICE com TR ligada faz o saldo devedor CRESCER", () => {
    const result = withFinancing({
      system: AmortizationSystem.PRICE,
      applyReferenceRate: true,
    });
    const rows = result.months.filter((m) => m.installment > 0);
    const subindo = rows.filter((row, i) => i > 0 && row.debt > rows[i - 1].debt).length;

    expect(subindo).toBeGreaterThan(rows.length * 0.9);
    expect(rows.at(-1)!.debt).toBeGreaterThan(rows[0].debt);
  });

  it("mesmo assim a parcela sempre cobre os juros — amortização não fica negativa", () => {
    const corrected = reais(283_000);
    const amortization = amortizationFor("PRICE", corrected, rate, 340);
    expect(amortization).toBeGreaterThan(0);
  });
});
