CREATE TABLE "outreach_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_key" text NOT NULL,
	"source_inquiry_id" uuid,
	"next_expected_date" date NOT NULL,
	"action" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_log_customer_date_action_key" UNIQUE("customer_key","next_expected_date","action")
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "cadence" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "cadence_confidence" real;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "cadence_evidence" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "cadence_source" text;--> statement-breakpoint
ALTER TABLE "outreach_log" ADD CONSTRAINT "outreach_log_source_inquiry_id_inquiries_id_fk" FOREIGN KEY ("source_inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_log_customer_key_idx" ON "outreach_log" USING btree ("customer_key");