CREATE TYPE "public"."order_status" AS ENUM('draft', 'paid', 'accepted', 'declined', 'in_progress', 'delivered', 'revision_requested', 'approved', 'refund_eligible', 'refunded', 'completed');--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "order_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"actor_id" uuid,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_note_length" CHECK (char_length("order_events"."note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"song_title" text NOT NULL,
	"artist_name" text NOT NULL,
	"brief_json" jsonb NOT NULL,
	"price_pence" integer NOT NULL,
	"currency" text NOT NULL,
	"turnaround_days" integer NOT NULL,
	"revisions_included" integer NOT NULL,
	"max_stems" integer NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_price_range" CHECK ("orders"."price_pence" between 500 and 1000000),
	CONSTRAINT "orders_currency_gbp" CHECK ("orders"."currency" = 'gbp'),
	CONSTRAINT "orders_revision_count_range" CHECK ("orders"."revision_count" between 0 and "orders"."revisions_included"),
	CONSTRAINT "orders_song_title_length" CHECK (char_length("orders"."song_title") between 1 and 120),
	CONSTRAINT "orders_artist_name_length" CHECK (char_length("orders"."artist_name") between 1 and 120),
	CONSTRAINT "orders_brief_size" CHECK (pg_column_size("orders"."brief_json") < 16384)
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_engineer_id_engineer_profiles_user_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineer_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_id_seq_idx" ON "order_events" USING btree ("order_id","seq");--> statement-breakpoint
CREATE INDEX "orders_client_id_idx" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "orders_engineer_id_idx" ON "orders" USING btree ("engineer_id");