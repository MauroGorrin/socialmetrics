CREATE TABLE "email_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid,
	"recipient" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_event_event_type_check" CHECK ("email_event"."event_type" in ('sent', 'send_failed', 'delivered', 'bounced', 'complained', 'opened', 'clicked', 'delivery_delayed'))
);
--> statement-breakpoint
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_event_org_id_created_at" ON "email_event" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_email_event_provider_id" ON "email_event" USING btree ("provider_id");