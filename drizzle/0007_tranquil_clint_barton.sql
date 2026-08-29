CREATE TABLE "report_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"period" date NOT NULL,
	"url" text NOT NULL,
	"format" text,
	"reach" numeric(14, 2),
	"interactions" numeric(14, 2),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_platform_check";--> statement-breakpoint
ALTER TABLE "metric" DROP CONSTRAINT "metric_metric_name_check";--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "report_profile" text DEFAULT 'ads' NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "profile" text DEFAULT 'ads' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_post" ADD CONSTRAINT "report_post_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_post" ADD CONSTRAINT "report_post_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_post" ADD CONSTRAINT "report_post_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_report_post_org_client_period" ON "report_post" USING btree ("org_id","client_id","period");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_report_org_client_period" ON "report" USING btree ("org_id","client_id","period_month");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_report_profile_check" CHECK ("client"."report_profile" in ('organic', 'ads', 'mixed'));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_platform_check" CHECK ("client"."platform" in ('meta', 'google_ads', 'tiktok', 'instagram', 'facebook', 'youtube', 'linkedin'));--> statement-breakpoint
ALTER TABLE "metric" ADD CONSTRAINT "metric_metric_name_check" CHECK ("metric"."metric_name" in ('impressions', 'clicks', 'spend', 'ctr', 'cpl', 'roas', 'conversions', 'conversion_value', 'followers_start', 'followers_end', 'reach', 'profile_visits', 'link_clicks', 'interactions', 'posts_published', 'stories_published', 'video_views'));--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_profile_check" CHECK ("report"."profile" in ('organic', 'ads', 'mixed'));--> statement-breakpoint
-- Row-Level Security for the new table, matching drizzle/0001_rls_policies.sql.
-- Server code (Drizzle direct connection) and service_role bypass RLS; this
-- scopes what anon / authenticated can read via PostgREST.
ALTER TABLE "report_post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_see_own_org_report_posts" ON "report_post" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "report_post"."org_id"
      AND "membership"."user_id" = auth.uid()
  ));