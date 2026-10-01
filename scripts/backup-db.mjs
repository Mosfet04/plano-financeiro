/**
 * Backup do banco para um arquivo .sql.gz local.
 *
 * Rode via npm: `npm run db:backup:prod` (o banco real é o de produção).
 *
 * Por que `pg_dump` e não um dump em JSON nosso: o que importa num backup é o
 * restore, e restore com `psql` é lógica do Postgres. Um formato próprio faria
 * o caminho de volta depender de código nosso, que só seria exercitado no dia
 * do desastre — exatamente quando não se quer descobrir um bug.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import path from "node:path";

/** Quantos backups manter. Os mais antigos são apagados no fim. */
const KEEP = 14;
const DIR = path.resolve("backups");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente. Rode via npm run db:backup:prod.");
  process.exit(1);
}

/**
 * O Neon exige conexão DIRETA para dump — pelo endpoint pooled (PgBouncer em
 * modo transação) o `pg_dump` falha ou sai incompleto. Tirar o "-pooler" do
 * host é a conexão direta do mesmo banco.
 */
const direct = new URL(url);
if (direct.hostname.includes("-pooler")) {
  direct.hostname = direct.hostname.replace("-pooler", "");
}

if (direct.hostname === "host.neon.tech" || direct.username === "user") {
  console.error(
    `DATABASE_URL é o placeholder do .env.example (host "${direct.hostname}").\n` +
      "Use `npm run db:backup:prod`, ou preencha o DATABASE_URL do .env."
  );
  process.exit(1);
}

await mkdir(DIR, { recursive: true });

// Data local em ISO curto: 2026-09-09T2114 ordena igual ao alfabeto.
const stamp = new Date()
  .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
  .replace(" ", "T")
  .replace(/:/g, "")
  .slice(0, 15);
const file = path.join(DIR, `${direct.pathname.slice(1)}-${stamp}.sql.gz`);

console.log(`banco  : ${direct.hostname}${direct.pathname}`);
console.log(`destino: ${path.relative(process.cwd(), file)}`);

const dump = spawn(
  "pg_dump",
  [
    direct.toString(),
    // Restaura em qualquer projeto Neon, com qualquer nome de role.
    "--no-owner",
    "--no-privileges",
    // Um CREATE por linha em vez de COPY: o arquivo fica legível e um
    // conflito de linha não derruba o restore inteiro.
    "--column-inserts",
    "--quote-all-identifiers",
  ],
  { stdio: ["ignore", "pipe", "inherit"] }
);

dump.on("error", (cause) => {
  if (cause.code === "ENOENT") {
    console.error(
      "\npg_dump não encontrado. Instale o cliente do Postgres:\n" +
        "  sudo apt install postgresql-client-17\n\n" +
        "A versão do cliente tem que ser IGUAL OU MAIOR que a do servidor.\n" +
        "O Neon roda 17 — um pg_dump 16 recusa a conexão."
    );
  } else {
    console.error(`\nfalhou ao chamar pg_dump: ${cause.message}`);
  }
  process.exit(1);
});

try {
  await pipeline(dump.stdout, createGzip({ level: 9 }), createWriteStream(file));
} catch (cause) {
  console.error(`\nfalhou ao escrever o backup: ${cause.message}`);
  await unlink(file).catch(() => {});
  process.exit(1);
}

const code = await new Promise((resolve) => dump.on("close", resolve));
if (code !== 0) {
  // Arquivo truncado é pior que arquivo nenhum: parece backup e não é.
  await unlink(file).catch(() => {});
  console.error(`\npg_dump saiu com código ${code}. Backup incompleto apagado.`);
  process.exit(1);
}

const { size } = await stat(file);
if (size < 1024) {
  await unlink(file).catch(() => {});
  console.error(`\nbackup de ${size} bytes é suspeito de vazio. Apagado.`);
  process.exit(1);
}

console.log(`tamanho: ${(size / 1024).toFixed(1)} KB\n`);

// Poda: mantém os KEEP mais recentes.
const old = (await readdir(DIR))
  .filter((name) => name.endsWith(".sql.gz"))
  .sort()
  .slice(0, -KEEP);
for (const name of old) {
  await unlink(path.join(DIR, name));
  console.log(`removido antigo: ${name}`);
}

console.log("Para restaurar num banco VAZIO:");
console.log(`  gunzip -c ${path.relative(process.cwd(), file)} | psql "$DATABASE_URL"`);
