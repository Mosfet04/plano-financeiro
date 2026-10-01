// Script temporário e SÓ DE LEITURA: mostra o que existe no banco hoje.
// Rode com:   node --env-file=.env.production conferir-dados.mjs
//             (o .env local está com o placeholder — o banco real é o de produção)
// Depois:     rm conferir-dados.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const [{ db }] = await sql`select current_database() as db`;
console.log(`banco: ${db}\n`);

const counts = await sql`
  select 'users' as t, count(*)::int as n from users
  union all select 'plans',               count(*)::int from plans
  union all select 'income_settings',     count(*)::int from income_settings
  union all select 'yield_policies',      count(*)::int from yield_policies
  union all select 'recurring_items',     count(*)::int from recurring_items
  union all select 'budget_categories',   count(*)::int from budget_categories
  union all select 'goals',               count(*)::int from goals
  union all select 'financings',          count(*)::int from financings
  union all select 'extra_amortizations', count(*)::int from extra_amortizations
  union all select 'investments',         count(*)::int from investments
  union all select 'transactions',        count(*)::int from transactions
  union all select 'reserve_targets',     count(*)::int from reserve_targets
  union all select 'market_rates',        count(*)::int from market_rates
`;
for (const { t, n } of counts) {
  console.log(`  ${t.padEnd(22)} ${String(n).padStart(5)} linha(s)`);
}

const [{ cents }] = await sql`
  select coalesce(sum(cash_on_hand_cents), 0)::int as cents from yield_policies
`;
console.log(`\ncash_on_hand_cents ainda no banco: R$ ${(cents / 100).toFixed(2)}`);
console.log("(a coluna que a 0002 vai converter numa conta 'Conta corrente')");

const migrations = await sql`
  select count(*)::int as n from drizzle.__drizzle_migrations
`;
console.log(`\nmigrações aplicadas: ${migrations[0].n} — o código espera 4`);
