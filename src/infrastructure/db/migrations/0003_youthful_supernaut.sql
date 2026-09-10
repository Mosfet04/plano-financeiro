CREATE TABLE "month_closings" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"month" text NOT NULL,
	"leftover_cents" integer NOT NULL,
	"plan_target_cents" integer NOT NULL,
	"cash_cents" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "month_closings" ADD CONSTRAINT "month_closings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_month_closing_per_month" ON "month_closings" USING btree ("plan_id","month");