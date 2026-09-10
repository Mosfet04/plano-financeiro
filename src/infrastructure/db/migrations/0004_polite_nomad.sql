CREATE TABLE "fgts_settings" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"deposit_rate" numeric(9, 6) DEFAULT 0.08 NOT NULL,
	"annual_yield" numeric(9, 6) DEFAULT 0.03 NOT NULL,
	"withdrawal_every_months" integer DEFAULT 24 NOT NULL,
	"first_withdrawal_month" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financings" ADD COLUMN "extra_amortization_effect" text DEFAULT 'SHORTEN_TERM' NOT NULL;--> statement-breakpoint
ALTER TABLE "fgts_settings" ADD CONSTRAINT "fgts_settings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;