ALTER TABLE "membership" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_membership_invite_token" ON "membership" USING btree ("invite_token");--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_invite_token_unique" UNIQUE("invite_token");