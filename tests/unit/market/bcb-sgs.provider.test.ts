import { afterEach, describe, expect, it, vi } from "vitest";

import { BcbSgsProvider, SGS_SERIES } from "@/infra/market/bcb-sgs.provider";

function mockSgs(responses: Record<number, unknown>) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const code = Number(url.match(/sgs\.(\d+)/)?.[1]);
    const body = responses[code];

    if (body === undefined) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BcbSgsProvider", () => {
  it("converte percentual do SGS em decimal ao ano", async () => {
    vi.stubGlobal(
      "fetch",
      mockSgs({
        [SGS_SERIES.SELIC]: [{ data: "16/09/2026", valor: "14.00" }],
        [SGS_SERIES.CDI]: [{ data: "26/08/2026", valor: "13.90" }],
        [SGS_SERIES.IPCA_MONTHLY]: Array.from({ length: 12 }, () => ({
          data: "01/07/2026",
          valor: "0.00",
        })),
        [SGS_SERIES.REFERENCE_RATE]: [{ data: "26/08/2026", valor: "0.1709" }],
      })
    );

    const rates = await new BcbSgsProvider().fetchCurrent();

    expect(rates.selicAnnual).toBeCloseTo(0.14, 10);
    expect(rates.cdiAnnual).toBeCloseTo(0.139, 10);
    expect(rates.referenceRateMonthly).toBeCloseTo(0.001709, 10);
  });

  it("acumula o IPCA dos 12 meses em vez de anualizar o último", async () => {
    vi.stubGlobal(
      "fetch",
      mockSgs({
        [SGS_SERIES.SELIC]: [{ data: "16/09/2026", valor: "14.00" }],
        [SGS_SERIES.CDI]: [{ data: "26/08/2026", valor: "13.90" }],
        // 12 meses de 0,50% compõem 6,17%, não 6,00%.
        [SGS_SERIES.IPCA_MONTHLY]: Array.from({ length: 12 }, () => ({
          data: "01/07/2026",
          valor: "0.50",
        })),
        [SGS_SERIES.REFERENCE_RATE]: [{ data: "26/08/2026", valor: "0.1709" }],
      })
    );

    const rates = await new BcbSgsProvider().fetchCurrent();

    expect(rates.ipcaAnnual).toBeCloseTo(Math.pow(1.005, 12) - 1, 10);
    expect(rates.ipcaAnnual).toBeGreaterThan(0.06);
  });

  it("segue em frente quando só a TR falha", async () => {
    vi.stubGlobal(
      "fetch",
      mockSgs({
        [SGS_SERIES.SELIC]: [{ data: "16/09/2026", valor: "14.00" }],
        [SGS_SERIES.CDI]: [{ data: "26/08/2026", valor: "13.90" }],
        [SGS_SERIES.IPCA_MONTHLY]: [{ data: "01/07/2026", valor: "0.07" }],
        // Série 226 ausente: devolve 404.
      })
    );

    const rates = await new BcbSgsProvider().fetchCurrent();
    expect(rates.referenceRateMonthly).toBeNull();
    expect(rates.selicAnnual).toBeCloseTo(0.14, 10);
  });

  it("falha quando a Selic não vem — sem taxa não há snapshot", async () => {
    vi.stubGlobal("fetch", mockSgs({}));
    await expect(new BcbSgsProvider().fetchCurrent()).rejects.toThrow(/432/);
  });

  it("rejeita valor não numérico em vez de gravar NaN", async () => {
    vi.stubGlobal(
      "fetch",
      mockSgs({
        [SGS_SERIES.SELIC]: [{ data: "16/09/2026", valor: "n/d" }],
        [SGS_SERIES.CDI]: [{ data: "26/08/2026", valor: "13.90" }],
        [SGS_SERIES.IPCA_MONTHLY]: [{ data: "01/07/2026", valor: "0.07" }],
        [SGS_SERIES.REFERENCE_RATE]: [{ data: "26/08/2026", valor: "0.1709" }],
      })
    );

    await expect(new BcbSgsProvider().fetchCurrent()).rejects.toThrow(/Valor inválido/);
  });
});
