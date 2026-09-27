ALTER TABLE "services" DROP CONSTRAINT "services_price_positive";--> statement-breakpoint
ALTER TABLE "engineer_profiles" ADD CONSTRAINT "engineer_profiles_slug_length" CHECK (char_length("engineer_profiles"."slug") between 3 and 40);--> statement-breakpoint
ALTER TABLE "engineer_profiles" ADD CONSTRAINT "engineer_profiles_bio_length" CHECK (char_length("engineer_profiles"."bio") <= 2000);--> statement-breakpoint
ALTER TABLE "engineer_profiles" ADD CONSTRAINT "engineer_profiles_genres_count" CHECK (cardinality("engineer_profiles"."genres") <= 8);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_price_range" CHECK ("services"."price_pence" between 500 and 1000000);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_name_length" CHECK (char_length("services"."name") between 1 and 80);