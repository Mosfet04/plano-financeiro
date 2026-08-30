import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildContainer } from "@/composition/container";
import { formatBRL } from "@/core/domain/shared/money";
import { formatMonth } from "@/core/domain/shared/month";
import { getEnv } from "@/infra/config/env";

export const dynamic = "force-dynamic";

/**
 * Corpo opcional. Sem corpo, a rota busca as taxas no SGS do Banco Central.
 * Com as três taxas informadas, usa o que o agente mandou e nem chama o BCB.
 *
 * As taxas vêm como decimal ao ano: 0.14 é 14% a.a., não 14.
 */
const bodySchema = z
  .object({
    selicAnnual: z.number().min(0).max(1).optional(),
    cdiAnnual: z.number().min(0).max(1).optional(),
    ipcaAnnual: z.number().min(-0.5).max(1).optional(),
    referenceRateMonthly: z.number().min(0).max(0.1).nullable().optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

/**
 * Comparação em tempo constante. Um `!==` normal vaza o prefixo correto do
 * segredo pelo tempo de resposta.
 */
function isAuthorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const received = Buffer.from(header);
  const target = Buffer.from(expected);
  if (received.length !== target.length) return false;

  return timingSafeEqual(received, target);
}

async function handle(request: NextRequest) {
  const env = getEnv();

  // `getEnv` já exige CRON_SECRET com 32 caracteres, então aqui ele existe.
  // Sem essa garantia, a rota compararia contra "Bearer undefined" e abriria
  // para qualquer um que mandasse exatamente isso.
  if (!isAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let manual: z.infer<typeof bodySchema> | undefined;
  if (request.method === "POST") {
    const raw = await request.text();
    if (raw.trim()) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Corpo não é JSON válido." }, { status: 400 });
      }

      const parsed = bodySchema.safeParse(parsedJson);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Corpo inválido.", detalhes: z.flattenError(parsed.error).fieldErrors },
          { status: 400 }
        );
      }
      manual = parsed.data;
    }
  }

  const container = buildContainer();

  // Um snapshot de taxas para todo mundo, um impacto por plano: a Selic é a
  // mesma para os três, mas o que ela faz com a quitação de cada um não é.
  // Sem nenhum plano a rota ainda grava o snapshot — o histórico de taxas não
  // depende de existir plano.
  const plans = await container.repos.plans.listAll();

  const result = await container.useCases.refreshMarketRates.execute({
    planIds: plans.map((plan) => plan.id),
    manual,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: 502 }
    );
  }

  const { snapshot, previous, impacts } = result.value;

  return NextResponse.json({
    ok: true,
    fonte: snapshot.source,
    capturadoEm: snapshot.capturedAt.toISOString(),
    taxas: {
      selic: snapshot.selicAnnual,
      cdi: snapshot.cdiAnnual,
      ipca12m: snapshot.ipcaAnnual,
      trMensal: snapshot.referenceRateMonthly,
    },
    anterior: previous
      ? {
          capturadoEm: previous.capturedAt.toISOString(),
          selic: previous.selicAnnual,
          cdi: previous.cdiAnnual,
          ipca12m: previous.ipcaAnnual,
        }
      : null,
    // O diff é o ponto da rotina: não interessa "ok", interessa o que mudou —
    // e agora muda de um jeito para cada plano.
    impactos: impacts.map(({ planId, planName, impact }) => ({
      planoId: planId,
      plano: planName,
      quitacaoAntes: impact.payoffMonthBefore ? formatMonth(impact.payoffMonthBefore) : null,
      quitacaoDepois: impact.payoffMonthAfter ? formatMonth(impact.payoffMonthAfter) : null,
      mudouAQuitacao: impact.payoffMonthBefore !== impact.payoffMonthAfter,
      menorCaixaAntes: formatBRL(impact.minCashBefore),
      menorCaixaDepois: formatBRL(impact.minCashAfter),
      rendimentoAntes: impact.netAnnualYieldBefore,
      rendimentoDepois: impact.netAnnualYieldAfter,
      // A virada é o evento que a rotina existe para pegar: o dia em que
      // o CDI cai abaixo do custo da dívida e amortizar passa a valer.
      amortizarAntes: impact.amortizationBefore,
      amortizarDepois: impact.amortizationAfter,
      viradaDaDecisao: impact.amortizationFlipped,
    })),
  });
}

/** O Vercel Cron chama por GET. */
export async function GET(request: NextRequest) {
  return handle(request);
}

/** O agente chama por POST quando quer informar as taxas ele mesmo. */
export async function POST(request: NextRequest) {
  return handle(request);
}
