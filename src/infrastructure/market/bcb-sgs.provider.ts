import type { MarketRatesProvider } from "@/core/application/ports";

/**
 * Séries do SGS (Sistema Gerenciador de Séries Temporais) do Banco Central.
 * Confirmadas com chamada real em 27/08/2026.
 */
export const SGS_SERIES = {
  /** Meta Selic definida pelo Copom, % ao ano. */
  SELIC: 432,
  /** CDI anualizado base 252, % ao ano. */
  CDI: 4389,
  /** IPCA, variação % no mês. */
  IPCA_MONTHLY: 433,
  /** TR, % no mês. */
  REFERENCE_RATE: 226,
} as const;

const BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
const TIMEOUT_MS = 10_000;

interface SgsPoint {
  data: string;
  valor: string;
}

async function fetchSeries(code: number, last: number): Promise<SgsPoint[]> {
  const url = `${BASE_URL}.${code}/dados/ultimos/${last}?formato=json`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SGS ${code} respondeu ${response.status}`);
  }

  const points = (await response.json()) as SgsPoint[];
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error(`SGS ${code} não devolveu pontos`);
  }
  return points;
}

/** O SGS publica percentuais ("14.00"); o domínio trabalha com decimais (0.14). */
function toDecimal(point: SgsPoint): number {
  const value = Number(point.valor);
  if (!Number.isFinite(value)) {
    throw new Error(`Valor inválido no SGS: "${point.valor}"`);
  }
  return value / 100;
}

export class BcbSgsProvider implements MarketRatesProvider {
  async fetchCurrent() {
    const [selic, cdi, ipca12, tr] = await Promise.all([
      fetchSeries(SGS_SERIES.SELIC, 1),
      fetchSeries(SGS_SERIES.CDI, 1),
      // 12 pontos mensais para acumular o IPCA do ano.
      fetchSeries(SGS_SERIES.IPCA_MONTHLY, 12),
      fetchSeries(SGS_SERIES.REFERENCE_RATE, 1).catch(() => null),
    ]);

    const ipcaAnnual = ipca12.reduce((acc, point) => acc * (1 + toDecimal(point)), 1) - 1;

    return {
      selicAnnual: toDecimal(selic[0]),
      cdiAnnual: toDecimal(cdi[0]),
      ipcaAnnual,
      referenceRateMonthly: tr ? toDecimal(tr[0]) : null,
      raw: {
        fetchedAt: new Date().toISOString(),
        selic: selic[0],
        cdi: cdi[0],
        ipcaMonthly: ipca12,
        referenceRate: tr?.[0] ?? null,
      },
    };
  }
}
