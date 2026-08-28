-- Multi-tenant Row-Level Security. Server code (Drizzle over the direct
-- connection) and Supabase's service_role bypass RLS; these policies scope
-- what the `anon` / `authenticated` roles can read via PostgREST. App-level
-- org_id filtering (tenantGuard) remains the primary enforcement layer.

ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "users_see_own_orgs" ON "organization" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "organization"."id"
      AND "membership"."user_id" = auth.uid()
  ));
--> statement-breakpoint

CREATE POLICY "users_see_own_org_members" ON "membership" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership" AS "m2"
    WHERE "m2"."org_id" = "membership"."org_id"
      AND "m2"."user_id" = auth.uid()
  ));
--> statement-breakpoint

CREATE POLICY "users_see_own_org_clients" ON "client" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "client"."org_id"
      AND "membership"."user_id" = auth.uid()
  ));
--> statement-breakpoint

CREATE POLICY "users_see_own_org_metrics" ON "metric" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "metric"."org_id"
      AND "membership"."user_id" = auth.uid()
  ));
--> statement-breakpoint

CREATE POLICY "users_see_own_org_reports" ON "report" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "report"."org_id"
      AND "membership"."user_id" = auth.uid()
  ));
--> statement-breakpoint

CREATE POLICY "users_see_own_org_report_comments" ON "report_comment" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "report_comment"."org_id"
      AND "membership"."user_id" = auth.uid()
  ));
--> statement-breakpoint

CREATE POLICY "admin_see_org_audit" ON "audit_log" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "membership"
    WHERE "membership"."org_id" = "audit_log"."org_id"
      AND "membership"."user_id" = auth.uid()
      AND "membership"."role" IN ('owner', 'admin')
  ));
