ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "is_bookmarked" boolean DEFAULT false;
