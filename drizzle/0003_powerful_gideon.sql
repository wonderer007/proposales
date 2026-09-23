ALTER TABLE "proposals" ADD COLUMN "recipient_selections" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "version_note" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "rejection_category" text;