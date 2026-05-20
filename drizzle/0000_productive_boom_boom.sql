CREATE TABLE "announcement_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"fingerprint" varchar(255) NOT NULL,
	"snapshotted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"unit_type" varchar(100) NOT NULL,
	"supply_area" numeric,
	"exclusive_area" numeric,
	"general_supply" integer,
	"special_supply" integer,
	"price_min" integer,
	"price_max" integer,
	"floor_min" integer,
	"floor_max" integer
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"announce_no" varchar(255) NOT NULL,
	"supply_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"announce_date" date,
	"apply_start_date" date,
	"apply_end_date" date,
	"winner_announce_date" date,
	"contract_start_date" date,
	"contract_end_date" date,
	"move_in_date" date,
	"total_supply_households" integer,
	"general_supply_households" integer,
	"special_supply_households" integer,
	"source_provider_id" uuid,
	"external_source_key" varchar(255),
	"raw_payload_id" uuid,
	"fingerprint" varchar(255),
	"latest_snapshot_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_announce_no_unique" UNIQUE("announce_no")
);
--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"sync_run_id" uuid,
	"previous_data" jsonb,
	"current_data" jsonb,
	"diff_summary" text,
	"severity" varchar(50) NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"notified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "housing_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"housing_mgmt_no" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"region_id" uuid,
	"address" text,
	"builder_name" varchar(255),
	"developer_name" varchar(255),
	"total_households" integer,
	"source_provider_id" uuid,
	"external_source_key" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "housing_projects_housing_mgmt_no_unique" UNIQUE("housing_mgmt_no"),
	CONSTRAINT "housing_projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"change_event_id" uuid NOT NULL,
	"channel" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"sent_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "raw_source_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"external_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"is_processed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sido" varchar(100) NOT NULL,
	"sigungu" varchar(100),
	"code" varchar(50) NOT NULL,
	"sido_code" varchar(50),
	"sigungu_code" varchar(50),
	CONSTRAINT "regions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "source_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"is_active" boolean DEFAULT true,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "source_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "source_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"total_fetched" integer DEFAULT 0,
	"total_normalized" integer DEFAULT 0,
	"total_upserted" integer DEFAULT 0,
	"total_changed" integer DEFAULT 0,
	"total_errors" integer DEFAULT 0,
	"error_summary" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"project_id" uuid NOT NULL,
	"notify_schedule_change" boolean DEFAULT true,
	"notify_musoonwi" boolean DEFAULT true,
	"notify_new_announcement" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_snapshots" ADD CONSTRAINT "announcement_snapshots_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_snapshots" ADD CONSTRAINT "announcement_snapshots_sync_run_id_source_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."source_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_units" ADD CONSTRAINT "announcement_units_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_project_id_housing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."housing_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_source_provider_id_source_providers_id_fk" FOREIGN KEY ("source_provider_id") REFERENCES "public"."source_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_raw_payload_id_raw_source_payloads_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_source_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_sync_run_id_source_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."source_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_projects" ADD CONSTRAINT "housing_projects_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_projects" ADD CONSTRAINT "housing_projects_source_provider_id_source_providers_id_fk" FOREIGN KEY ("source_provider_id") REFERENCES "public"."source_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_change_event_id_change_events_id_fk" FOREIGN KEY ("change_event_id") REFERENCES "public"."change_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_source_payloads" ADD CONSTRAINT "raw_source_payloads_sync_run_id_source_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."source_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_source_payloads" ADD CONSTRAINT "raw_source_payloads_provider_id_source_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."source_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_runs" ADD CONSTRAINT "source_sync_runs_provider_id_source_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."source_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_project_id_housing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."housing_projects"("id") ON DELETE no action ON UPDATE no action;