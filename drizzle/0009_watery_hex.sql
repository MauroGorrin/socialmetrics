CREATE TABLE "platform_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_account_id" text,
	"external_account_name" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"connected_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_connection_platform_check" CHECK ("platform_connection"."platform" in ('meta', 'google_ads')),
	CONSTRAINT "platform_connection_status_check" CHECK ("platform_connection"."status" in ('pending', 'connected', 'needs_reconnect', 'error', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "metric" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_connection" ADD CONSTRAINT "platform_connection_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connection" ADD CONSTRAINT "platform_connection_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connection" ADD CONSTRAINT "platform_connection_connected_by_user_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_connection_client_platform_unique" ON "platform_connection" USING btree ("client_id","platform");--> statement-breakpoint
CREATE INDEX "idx_platform_connection_org_id" ON "platform_connection" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_platform_connection_status" ON "platform_connection" USING btree ("status");--> statement-breakpoint
ALTER TABLE "metric" ADD CONSTRAINT "metric_source_check" CHECK ("metric"."source" in ('manual', 'meta', 'google_ads'));