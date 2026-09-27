CREATE TYPE "public"."file_kind" AS ENUM('stems', 'project', 'reference', 'demo', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"r2_key" text NOT NULL,
	"relative_path" text NOT NULL,
	"original_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime" text NOT NULL,
	"sha256" text,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"upload_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_r2_key_unique" UNIQUE("r2_key"),
	CONSTRAINT "files_size_range" CHECK ("files"."size_bytes" between 0 and 10737418240),
	CONSTRAINT "files_relative_path_length" CHECK (char_length("files"."relative_path") between 1 and 512),
	CONSTRAINT "files_original_name_length" CHECK (char_length("files"."original_name") between 1 and 255),
	CONSTRAINT "files_mime_length" CHECK (char_length("files"."mime") <= 255)
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_profiles_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_order_id_status_idx" ON "files" USING btree ("order_id","status");