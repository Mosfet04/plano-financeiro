CREATE TABLE "cash_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"indexer" text,
	"indexer_value" numeric(9, 6) DEFAULT 0 NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"checked_on" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cash_accounts_plan" ON "cash_accounts" USING btree ("plan_id");--> statement-breakpoint
-- Backfill antes de derrubar a coluna: o escalar "caixa livre hoje" virou uma
-- conta chamada "Conta corrente", com indexador NULO para não render — é
-- exatamente o que ele fazia antes. Quem guarda esse dinheiro em caixinha
-- rendendo CDI edita a conta em /premissas e marca o indexador.
INSERT INTO "cash_accounts" ("id", "plan_id", "name", "balance_cents", "indexer", "indexer_value", "tax_exempt", "checked_on")
SELECT gen_random_uuid()::text, "plan_id", 'Conta corrente', "cash_on_hand_cents", NULL, 0, false, to_char(CURRENT_DATE, 'YYYY-MM-DD')
FROM "yield_policies"
WHERE "cash_on_hand_cents" > 0;--> statement-breakpoint
ALTER TABLE "yield_policies" DROP COLUMN "cash_on_hand_cents";