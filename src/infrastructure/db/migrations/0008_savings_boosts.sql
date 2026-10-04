CREATE TABLE "savings_boosts" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"starts_on" text NOT NULL,
	"ends_on" text,
	"amount_cents" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savings_boosts" ADD CONSTRAINT "savings_boosts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_savings_boosts_plan" ON "savings_boosts" USING btree ("plan_id");