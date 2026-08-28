import { z } from "zod";

/**
 * Única porta de entrada para `process.env`. Nenhum outro módulo deve ler
 * variáveis de ambiente direto — se ler, o zod aqui vira decoração.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  /** Lista de e-mails autorizados a entrar, separados por vírgula. */
  ALLOWED_EMAILS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
    .refine((emails) => emails.length > 0, "ALLOWED_EMAILS não pode ficar vazio"),
  /** Segredo do Bearer da rota de taxas. 32 hex = 16 bytes de entropia. */
  CRON_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = Object.entries(z.flattenError(parsed.error).fieldErrors)
      .map(([key, messages]) => `  ${key}: ${(messages ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${fields}`);
  }

  cached = parsed.data;
  return cached;
}
