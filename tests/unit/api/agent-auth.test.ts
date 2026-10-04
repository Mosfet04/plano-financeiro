// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET as review, POST as submit } from "@/app/api/agent/review/route";
import { POST as simulate } from "@/app/api/agent/simulate/route";

const URL_BASE = "https://plano.test/api/agent";

function request(path: string, method: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${URL_BASE}/${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify({ changes: [{ kind: "NOTE" }] }) : undefined,
  });
}

/**
 * As rotas da rotina ficam fora da sessão no `proxy.ts`. O que as fecha é a
 * checagem do token em cada handler — este teste garante que ela vem antes de
 * qualquer leitura de corpo ou de banco.
 */
describe("/api/agent sem token", () => {
  const cases = [
    ["GET review", () => review(request("review", "GET"))],
    ["POST review", () => submit(request("review", "POST"))],
    ["POST simulate", () => simulate(request("simulate", "POST"))],
    [
      "Basic em vez de Bearer",
      () => review(request("review", "GET", { authorization: "Basic dXNlcjpwYXNz" })),
    ],
    ["Bearer vazio", () => review(request("review", "GET", { authorization: "Bearer " }))],
  ] as const;

  it.each(cases)("%s → 401", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("AGENT_UNAUTHORIZED");
  });
});
