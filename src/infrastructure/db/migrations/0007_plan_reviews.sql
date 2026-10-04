CREATE TABLE "plan_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"month" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"review_id" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"change" jsonb NOT NULL,
	"impact" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "kind" text DEFAULT 'WATCH' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_suggestions" ADD CONSTRAINT "plan_suggestions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_suggestions" ADD CONSTRAINT "plan_suggestions_review_id_plan_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."plan_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_reviews_plan" ON "plan_reviews" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_plan_suggestions_review" ON "plan_suggestions" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "idx_plan_suggestions_plan_status" ON "plan_suggestions" USING btree ("plan_id","status");