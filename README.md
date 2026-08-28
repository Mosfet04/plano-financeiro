# Plano financeiro

Substitui a planilha `Plano_Financeiro_Agosto.xlsx` por uma aplicação que roda no celular e no
computador: metas customizáveis, lançamento de gasto em dez segundos, projeção mês a mês até a
quitação do apartamento, e uma rotina semanal que atualiza Selic/CDI/IPCA e refaz a conta.

O motor reproduz a planilha inteira — os 84 meses da aba "4. Detalhe" batem dentro de R$ 2, e os
números da capa batem exatos: quitação em **set/2030**, menor caixa de **−R$ 2.435,52** em
dez/2026, reforço de **R$ 608,88/mês** para fechar esse buraco.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle + Neon · next-auth v5 ·
Recharts · Vitest. Deploy na Vercel, banco no Neon, tudo dentro do free tier.

## Arquitetura

Onion, com dependências apontando sempre para dentro:

```
app/                     páginas, server actions, route handlers
src/composition/         raiz de composição (buildContainer)
src/core/application/    ports/ (interfaces) + use-cases/
src/core/domain/         entidades, regras puras — zero import de framework
src/infrastructure/      Drizzle, Auth.js, provider do Banco Central, config
```

Aliases: `@/core/*`, `@/infra/*`, `@/composition/*`, `@/*`.

### Convenções (siga ao adicionar código)

- **Dinheiro é inteiro em centavos** (`Cents`, tipo marcado). Nunca `number` em reais fora da
  borda de entrada e de exibição. Colunas com sufixo `_cents`.
- **Mês é `"YYYY-MM"`**, data civil é `"YYYY-MM-DD"` — texto, não `Date`. Mês não tem fuso.
- **`Result<T>` em vez de exceção** para fluxo de negócio. `throw` só para dado corrompido em
  infraestrutura.
- **Zod só na borda** (server actions e route handlers), nunca em `src/core/`.
- **Nomes, tipos e arquivos em inglês**; rotas, UI e comentários de regra de negócio em português.
- **`getEnv()` é a única leitura de `process.env`.** Nenhum módulo lê variável de ambiente direto.
- **CRUD simples fala direto com `container.repos`**; só o que tem regra vira caso de uso. Hoje são
  três: `getProjection`, `closeMonth`, `refreshMarketRates`.
- **Toda action confere o dono** antes de gravar ou apagar: id vindo do cliente não é confiável.

## Como o motor funciona

`src/core/domain/projection/project-plan.ts` é uma função pura, sem I/O. Duas passadas:

1. **Base** — renda (salário com reajuste anual, PLR com a tabela exclusiva de IR, abono de férias,
   13º rateado), despesas vigentes no mês, parcela do financiamento e saldo devedor.
2. **Alocação** — o que sobra enche a reserva até o alvo; o excedente vai para o caixa de quitação,
   que capitaliza ao mês. Quitação é o primeiro mês em que o caixa cobre o saldo devedor.

A separação existe porque o alvo da reserva depende do custo de vida do primeiro mês _com parcela_,
que só se conhece depois de percorrer os meses.

**A generalização que substitui as regras hardcoded da planilha:** contas recorrentes têm
`startsOn`/`endsOn`. O aluguel é um item que termina no mês da primeira parcela; o condomínio é um
que começa nele; o auxílio home office é um item de _entrada_ no grupo moradia, que abate o custo do
apê exatamente como a planilha fazia na mão. O motor não tem nenhum caso especial para a mudança.

## Rotina semanal de taxas

`GET /api/cron/market-rates` com `Authorization: Bearer $CRON_SECRET`.

A Vercel chama toda quinta às 12h UTC (`vercel.json`). A rota busca as séries do SGS do Banco
Central — Selic `432`, CDI `4389`, IPCA `433` (12 meses acumulados), TR `226` — grava um snapshot
novo (a tabela é append-only) e devolve o **impacto na projeção**, não um "ok":

```json
{
  "impacto": {
    "quitacaoAntes": "set/2030",
    "quitacaoDepois": "out/2030",
    "mudouAQuitacao": true,
    "menorCaixaAntes": "R$ -2.435,52",
    "menorCaixaDepois": "R$ -2.512,10"
  }
}
```

Isso só mexe na projeção porque a política de rendimento vem `CDI_LINKED` por padrão. No modo
`MANUAL` o snapshot é gravado, mas a conta não muda.

**Quando o BCB estiver fora do ar**, o agente manda as taxas ele mesmo (decimal ao ano, não
percentual):

```bash
curl -X POST "$APP_URL/api/cron/market-rates" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"selicAnnual":0.14,"cdiAnnual":0.139,"ipcaAnnual":0.045,"notes":"Copom de 05/08"}'
```

Com as três taxas presentes a rota nem chama o BCB e grava a fonte como `AGENT`. Informando só
algumas, o resto vem do BCB.

## Configuração

1. **Banco** — crie um projeto no [Neon](https://neon.tech) (free tier) e copie a connection string.
2. **Google OAuth** — Google Cloud Console → Credentials → OAuth client ID → Web. Redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<seu-app>.vercel.app/api/auth/callback/google`
3. **Env** — copie `.env.example` para `.env` e preencha. `AUTH_SECRET` e `CRON_SECRET` já vêm
   gerados no `.env` local.
4. **Migração e seed**:

```bash
npm run db:migrate && npm run db:seed
```

O seed cria o usuário do `ALLOWED_EMAILS` e o plano com os dados reais da planilha. É idempotente:
rodar de novo com plano existente não faz nada.

5. **Primeiro snapshot de taxas**:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/market-rates
```

## Scripts

| Comando                                          | O que faz                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `npm run dev`                                    | servidor de desenvolvimento                                               |
| `npm run test`                                   | testes (motor de projeção, IR da PLR, fechamento do mês, provider do BCB) |
| `npm run typecheck` / `npm run lint`             | verificação estática                                                      |
| `npm run db:generate` / `db:migrate` / `db:seed` | migrações e carga inicial                                                 |

## Telas

`/resumo` (capa e alertas) · `/mes` (lançamentos e orçamento) · `/metas` · `/projecao` (gráfico e
tabela) · `/premissas` (tudo editável) · `/aparencia`.

No celular: barra inferior com quatro destinos e o botão central de novo lançamento, que abre uma
folha de baixo. No desktop: rail vertical de ícones à esquerda. Design em Fluent 2, a linguagem
visual do Microsoft Teams.

## Premissas e limites conhecidos

- **TR desligada por padrão.** A planilha assume TR = 0, e é assim que o teste-ouro reproduz os
  números dela. Mas em ago/2026 a TR está em ~0,17% ao mês, o que em 420 meses **não** é
  desprezível. O interruptor está em `/premissas` → Financiamento, e ligá-lo deixa o plano mais
  pessimista e mais realista.
- **Correção das aplicações até o vencimento** usa o indexador constante contra o snapshot atual e
  uma alíquota única de IR, em vez da tabela regressiva. Melhor que o valor de face da planilha,
  mas ainda é projeção.
- **Juros ao mês = taxa anual ÷ 12**, sem capitalizar — é a convenção do contrato da CAIXA, e é o
  que reproduz os R$ 1.659,67 de juros da primeira parcela.
- **Divergência de centavos.** A planilha calcula em ponto flutuante sem arredondar; aqui tudo é
  inteiro em centavos. A amortização SAC, por exemplo, é R$ 619,047619 lá e R$ 619,05 aqui. O
  teste-ouro tolera R$ 2 ao longo dos 84 meses.
- **Pergunta em aberto do plano:** se ITBI e registro entram no financiamento ou saem do bolso.
  Muda cerca de R$ 10 mil e é a maior incerteza do modelo hoje.

## Fora do escopo desta versão

Import de CSV/extrato, rota de API para lançar gastos pelo agente, multiusuário, testes
end-to-end.
