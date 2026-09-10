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
2. **Alocação** — o caixa de abertura e o que sobra em cada mês enchem a reserva até o alvo; o
   excedente vai para o caixa de quitação. Os dois capitalizam ao mês. Quitação é o primeiro mês em
   que o caixa cobre o saldo devedor.

A separação existe porque o alvo da reserva depende do custo de vida do primeiro mês _com parcela_,
que só se conhece depois de percorrer os meses.

**A generalização que substitui as regras hardcoded da planilha:** contas recorrentes têm
`startsOn`/`endsOn`. O aluguel é um item que termina no mês da primeira parcela; o condomínio é um
que começa nele; o auxílio home office é um item de _entrada_ no grupo moradia, que abate o custo do
apê exatamente como a planilha fazia na mão. O motor não tem nenhum caso especial para a mudança.

## Caixa, caixinhas e aplicações

São duas tabelas porque são duas coisas diferentes, e confundi-las custou uma gambiarra:

|                     | `cash_accounts`                                        | `investments`                      |
| ------------------- | ------------------------------------------------------ | ---------------------------------- |
| O que é             | conta corrente, caixinha do Nubank, cofrinho do PicPay | CDB, LCI, Tesouro com vencimento   |
| Vencimento          | não tem — liquidez diária                              | `maturity_date`, obrigatório       |
| Como entra na conta | **é** o caixa do primeiro mês, e rende ali             | _cai_ no caixa do mês em que vence |

Ambas usam o mesmo par `indexer`/`indexer_value` (`103% CDI` → `CDI_PCT` com 1.03) resolvido contra
o snapshot de taxas vigente. Em `cash_accounts` o indexador pode ser **nulo**: é dinheiro que não
rende, o caso da conta corrente.

Três decisões que valem registrar:

- **O caixa de abertura passa pela regra de alocação**, igual a qualquer entrada: enche a reserva até
  o alvo, e o que passa vira caixa de quitação. Antes era um escalar
  (`yield_policies.cash_on_hand_cents`) jogado direto em `reserve`, e todo dinheiro acima do alvo
  ficava **preso** lá — não contava para a quitação nem para o menor caixa do plano. Lançar caixa
  extra como "aplicação já vencida" era a única coisa que funcionava, por acidente: vencimento passa
  pela regra, escalar não passava.
- **A reserva capitaliza pela média das contas, ponderada pelo saldo** — a taxa de onde o dinheiro
  realmente está. Sem conta cadastrada a taxa é zero e a reserva não rende: o motor só afirma
  rendimento onde você disse que o dinheiro está, e é isso que mantém o teste-ouro batendo com a
  planilha, que nunca rendeu a reserva.
- **O caixa de quitação segue a política do plano** (`yield_policies`, hoje ligada ao CDI), não a
  média das contas: é dinheiro que ainda vai entrar e ainda não tem endereço.

### Onde a projeção começa

O caixa de hoje já contém o passado. Replayar os meses vividos a partir das premissas soma o mesmo
dinheiro duas vezes — com o plano começando em ago/2026 e um saldo conferido em 09/09, eram uns
R$ 6.100 inventados. Duas perguntas diferentes resolvem isso, e confundi-las é o bug fácil aqui:

**1. Onde a projeção recomeça?** Depois do último mês fechado (`month_closings`). Sem nenhum
fechamento, no mês do saldo conferido. Sem nenhum dos dois, em `start_month`.

**2. Até que data o passado já está no saldo?** A data do saldo conferido — é literalmente o que ela
significa. O fim do último mês fechado entra num `max` para o caso do fechamento ser mais novo que a
conferência; aí o saldo está velho, e o plano subestima o caixa em vez de contar duas vezes.

A segunda decide quais aplicações já venceram _para dentro_ do saldo, e a comparação é **por data,
não por mês**: um mês fechado e um saldo conferido no dia 9 cortam em pontos diferentes do mesmo mês.

O primeiro mês projetado **não deposita** quando o saldo foi conferido dentro dele: parte do mês já
está no saldo e não dá para saber quanto. É exatamente isso que fechar o mês resolve.

```
sem fechar nada, saldo de R$ 3.143 conferido em 09/09
  2026-09   venceu     R$ 0,00   toReserve      R$ 0,00   reserva  R$ 3.143,00  ← só o conferido
  2026-10   venceu     R$ 0,00   toReserve  R$ 3.063,05   reserva  R$ 6.235,44

setembro fechado, saldo de R$ 6.300 conferido em 30/09
  2026-10   venceu     R$ 0,00   toReserve  R$ 3.063,05   reserva  R$ 9.363,05  ← deposita inteiro
  2026-11   venceu R$ 1.477,32   toReserve  R$ 5.349,41   reserva R$ 14.800,00
```

Nos dois casos a LCI que venceu em 08/09 some da projeção — ela já está dentro da caixinha. O CDB
que vence em 09/11 continua caindo em novembro.

**A disciplina que isso pede é uma só: confira os saldos ao fechar o mês.** No último dia do mês ou
no primeiro do seguinte — o dia 1º é caso especial de propósito, porque nada daquele mês está no
saldo ainda e ele deposita inteiro. Do dia 2 em diante o mês não deposita, e conferir em 01/10 sem
essa exceção custaria a sobra inteira de outubro.

Fechar sem conferir deixa o plano partir de um caixa velho, e `/premissas` avisa quando isso
acontece.

Sem fechamento e sem conta cadastrada o plano roda desde `start_month` como sempre — é o que mantém
o teste-ouro batendo com a planilha.

### `month_closings` — o que cada mês foi

Fechar um mês congela três números: a sobra realizada, a meta que o plano esperava **na época**, e o
caixa total naquele momento. O motor de projeção lê só o `month` — é ele que corta história de
projeção. Os valores existem para a série "o plano previu × eu fiz", em `/mes`.

Congelado é o ponto: mexer no orçamento de mercado hoje não pode reescrever o que setembro de 2026
foi. É por isso que o fechamento grava em vez de recalcular sob demanda.

Refechar o mesmo mês sobrescreve, e reabrir apaga a linha — é o fluxo normal quando um lançamento
atrasado aparece. `SettleMonthUseCase` recusa fechar mês que ainda não começou: congelaria um número
que ainda vai mudar e tiraria da projeção uma sobra que ainda está inteira por vir.

## Rotina semanal de taxas

`GET /api/cron/market-rates` com `Authorization: Bearer $CRON_SECRET`.

A Vercel chama toda quinta às 12h UTC (`vercel.json`). A rota busca as séries do SGS do Banco
Central — Selic `432`, CDI `4389`, IPCA `433` (12 meses acumulados), TR `226` — grava um snapshot
novo (a tabela é append-only) e devolve o **impacto na projeção**, não um "ok":

```json
{
  "impactos": [
    {
      "plano": "Plano de Mateus",
      "quitacaoAntes": "set/2030",
      "quitacaoDepois": "out/2030",
      "mudouAQuitacao": true,
      "menorCaixaAntes": "R$ -2.435,52",
      "menorCaixaDepois": "R$ -2.512,10"
    }
  ]
}
```

O snapshot de taxas é **um só para todo mundo** — `market_rates` não tem `planId` de
propósito, a Selic é a mesma para todos. O que é por pessoa é o impacto: o mesmo CDI mexe na
quitação de cada plano de um jeito, então a rotina devolve uma entrada por plano.

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
   - `https://<dominio-real>.vercel.app/api/auth/callback/google`

   O domínio tem que ser copiado do painel da Vercel depois do primeiro deploy, não deduzido do
   nome do projeto: se o subdomínio já estiver tomado por outra pessoa, a Vercel entrega um nome
   diferente do que você pediu.

3. **Env** — copie `.env.example` para `.env` e preencha. `AUTH_SECRET` e `CRON_SECRET` já vêm
   gerados no `.env` local.
4. **Migração e seed**:

```bash
npm run db:migrate && npm run db:seed
```

O seed cria o usuário do **primeiro** e-mail de `ALLOWED_EMAILS` e o plano com os dados reais da
planilha. É idempotente: rodar de novo com plano existente não faz nada. É o único plano que vem
de script — os outros nascem vazios no primeiro login (veja [Multiusuário](#multiusuário)).

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

`/resumo` (capa e alertas) · `/mes` (lançamentos, orçamento, fechamento do mês e a série "previu ×
fiz") · `/metas` · `/projecao` (gráfico e tabela) · `/premissas` (tudo editável) · `/aparencia`.

No celular: barra inferior com quatro destinos e o botão central de novo lançamento, que abre uma
folha de baixo. No desktop: rail vertical de ícones à esquerda. Design em Fluent 2, a linguagem
visual do Microsoft Teams.

## Multiusuário

Cada pessoa tem **um plano**, e todo o resto pendura nele: as tabelas descem de `plans` por
`ON DELETE CASCADE`, e o índice `uq_plan_per_user` faz valer o "um por pessoa" que antes só
existia no código.

O isolamento não depende de lembrar de filtrar: toda página e toda action começa por
`resolvePlanContext()`, que resolve o plano **pela sessão** — nunca por um id vindo do cliente —
e ainda reconfere `existing.planId` antes de gravar ou apagar.

**Para convidar alguém:** acrescente o e-mail em `ALLOWED_EMAILS` e publique. No primeiro login,
o evento `createUser` do Auth.js cria um plano vazio (as três linhas obrigatórias — `plans`,
`income_settings`, `yield_policies` — mais seis categorias de gasto) e a pessoa preenche o resto
em `/premissas`. Ninguém precisa de terminal nem de você.

As categorias iniciais nascem com **orçamento zero** de propósito: chutar o orçamento de outra
pessoa produz um número inventado que parece oficial. Os medidores tratam zero como 0%, então
nada aparece estourado no primeiro dia.

Se o evento falhar — ou se a conta veio do seed, que cria a linha em `users` antes do login —
`/sem-plano` oferece um botão que refaz a mesma chamada. O caso de uso é idempotente, e o índice
único decide a corrida entre duas abas abrindo o app ao mesmo tempo.

## Premissas e limites conhecidos

- **TR desligada por padrão.** A planilha assume TR = 0, e é assim que o teste-ouro reproduz os
  números dela. Mas em ago/2026 a TR está em ~0,17% ao mês, o que em 420 meses **não** é
  desprezível. O interruptor está em `/premissas` → Financiamento, e ligá-lo deixa o plano mais
  pessimista e mais realista.
- **Correção das aplicações até o vencimento** usa o indexador constante contra o snapshot atual e
  uma alíquota única de IR, em vez da tabela regressiva. Melhor que o valor de face da planilha,
  mas ainda é projeção. Vale igual para as contas de caixa: uma caixinha com menos de 180 dias paga
  22,5% de IR, não os 15% configurados.
- **O saldo das contas de caixa é digitado, não lido.** Não há integração com banco: se `checked_on`
  está velho, a projeção começa de um caixa velho — `/premissas` avisa quando o saldo é de um mês
  que já passou.
- **O mês do saldo conferido não deposita.** O plano descarta a sobra prevista dele inteira, mesmo
  que você confira no dia 2. A tabela ainda mostra o `leftover` previsto, mas ele não entra no caixa.
  Fechar o mês com o saldo conferido no fechamento é o que evita isso.
- **Fechamento não valida o caixa.** Nada confere se o saldo digitado bate com a sobra declarada — se
  os dois discordam, o plano acredita no saldo, que é o que existe de verdade no banco.
- **Juros ao mês = taxa anual ÷ 12**, sem capitalizar — é a convenção do contrato da CAIXA, e é o
  que reproduz os R$ 1.659,67 de juros da primeira parcela.
- **Divergência de centavos.** A planilha calcula em ponto flutuante sem arredondar; aqui tudo é
  inteiro em centavos. A amortização SAC, por exemplo, é R$ 619,047619 lá e R$ 619,05 aqui. O
  teste-ouro tolera R$ 2 ao longo dos 84 meses.
- **Pergunta em aberto do plano:** se ITBI e registro entram no financiamento ou saem do bolso.
  Muda cerca de R$ 10 mil e é a maior incerteza do modelo hoje.

## Fora do escopo desta versão

Import de CSV/extrato, rota de API para lançar gastos pelo agente, mais de um plano por pessoa,
convite por link (hoje se convida editando `ALLOWED_EMAILS`), testes end-to-end.

**Reconciliação de verdade.** O fechamento acredita no saldo que você digita e não confere nada
contra ele. Comparar a variação do caixa entre dois fechamentos com a sobra declarada acharia o
lançamento que faltou — hoje isso é olho no olho.
