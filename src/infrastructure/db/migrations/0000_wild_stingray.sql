CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "income_settings" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"gross_salary_cents" integer NOT NULL,
	"net_salary_cents" integer NOT NULL,
	"annual_raise" numeric(9, 6) NOT NULL,
	"raise_month" integer NOT NULL,
	"meal_card_monthly_cents" integer DEFAULT 0 NOT NULL,
	"thirteenth_net_cents" integer DEFAULT 0 NOT NULL,
	"thirteenth_months" text DEFAULT '11,12' NOT NULL,
	"vacation_bonus_cents" integer DEFAULT 0 NOT NULL,
	"vacation_month" integer DEFAULT 1 NOT NULL,
	"plr_gross_salaries" numeric(9, 6) DEFAULT 0 NOT NULL,
	"plr_month" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"start_month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"effective_from" text NOT NULL,
	"months" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_policies" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'CDI_LINKED' NOT NULL,
	"manual_annual_net" numeric(9, 6) DEFAULT 0.11 NOT NULL,
	"cdi_percent" numeric(9, 6) DEFAULT 1 NOT NULL,
	"income_tax_rate" numeric(9, 6) DEFAULT 0.15 NOT NULL,
	"cash_on_hand_cents" integer DEFAULT 0 NOT NULL,
	"accrue_investments" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"monthly_budget_cents" integer NOT NULL,
	"default_payment_method" text DEFAULT 'CASH' NOT NULL,
	"color" text DEFAULT 'chart-1' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"target_month" text,
	"funding_source" text,
	"note" text,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_items" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"item_group" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_day" integer,
	"starts_on" text,
	"ends_on" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"date" text NOT NULL,
	"description" text NOT NULL,
	"kind" text DEFAULT 'EXPENSE' NOT NULL,
	"category_id" text,
	"goal_id" text,
	"payment_method" text DEFAULT 'CASH' NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_amortizations" (
	"id" text PRIMARY KEY NOT NULL,
	"financing_id" text NOT NULL,
	"month" text NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financings" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"principal_cents" integer NOT NULL,
	"term_months" integer NOT NULL,
	"annual_interest" numeric(9, 6) NOT NULL,
	"system" text DEFAULT 'SAC' NOT NULL,
	"insurance_monthly_cents" integer DEFAULT 0 NOT NULL,
	"first_installment_month" text NOT NULL,
	"apply_reference_rate" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"maturity_date" text NOT NULL,
	"indexer" text NOT NULL,
	"indexer_value" numeric(9, 6) NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"instruction" text
);
--> statement-breakpoint
CREATE TABLE "market_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selic_annual" numeric(9, 6) NOT NULL,
	"cdi_annual" numeric(9, 6) NOT NULL,
	"ipca_annual" numeric(9, 6) NOT NULL,
	"reference_rate_monthly" numeric(9, 6),
	"source" text NOT NULL,
	"notes" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_settings" ADD CONSTRAINT "income_settings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_targets" ADD CONSTRAINT "reserve_targets_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_policies" ADD CONSTRAINT "yield_policies_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_amortizations" ADD CONSTRAINT "extra_amortizations_financing_id_financings_id_fk" FOREIGN KEY ("financing_id") REFERENCES "public"."financings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financings" ADD CONSTRAINT "financings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reserve_target_per_month" ON "reserve_targets" USING btree ("plan_id","effective_from");--> statement-breakpoint
CREATE INDEX "idx_budget_categories_plan" ON "budget_categories" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_goals_plan" ON "goals" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_items_plan" ON "recurring_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_plan_date" ON "transactions" USING btree ("plan_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_extra_amortization_per_month" ON "extra_amortizations" USING btree ("financing_id","month");--> statement-breakpoint
CREATE INDEX "idx_financings_plan" ON "financings" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_investments_plan_maturity" ON "investments" USING btree ("plan_id","maturity_date");--> statement-breakpoint
CREATE INDEX "idx_market_rates_captured_at" ON "market_rates" USING btree ("captured_at");