CREATE TYPE "public"."service_type" AS ENUM('mix', 'master', 'mix_master');--> statement-breakpoint
CREATE TABLE "engineer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"stripe_account_id" text,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engineer_profiles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "engineer_profiles_slug_format" CHECK ("engineer_profiles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "engineer_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "service_type" NOT NULL,
	"price_pence" integer NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"turnaround_days" integer NOT NULL,
	"revisions_included" integer NOT NULL,
	"max_stems" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_price_positive" CHECK ("services"."price_pence" > 0),
	CONSTRAINT "services_currency_gbp" CHECK ("services"."currency" = 'gbp'),
	CONSTRAINT "services_turnaround_range" CHECK ("services"."turnaround_days" between 1 and 60),
	CONSTRAINT "services_revisions_range" CHECK ("services"."revisions_included" between 0 and 10),
	CONSTRAINT "services_max_stems_range" CHECK ("services"."max_stems" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engineer_profiles" ADD CONSTRAINT "engineer_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_engineer_id_engineer_profiles_user_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineer_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "services_engineer_id_idx" ON "services" USING btree ("engineer_id");