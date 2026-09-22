CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company_name" text,
	"message" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"rfp_id" integer,
	"rfp_sync_error" text,
	"working_draft" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "inquiry_events_inquiry_id_position_key" UNIQUE("inquiry_id","position")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"proposales_uuid" text NOT NULL,
	"proposales_url" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"superseded_at" timestamp with time zone,
	"status_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_proposales_uuid_unique" UNIQUE("proposales_uuid"),
	CONSTRAINT "proposals_inquiry_id_version_key" UNIQUE("inquiry_id","version")
);
--> statement-breakpoint
ALTER TABLE "inquiry_events" ADD CONSTRAINT "inquiry_events_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_email_lower_idx" ON "inquiries" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "inquiries_contact_name_lower_idx" ON "inquiries" USING btree (lower("contact_name"));--> statement-breakpoint
CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inquiry_events_inquiry_id_idx" ON "inquiry_events" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "messages_inquiry_id_created_at_idx" ON "messages" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_one_active_per_inquiry_idx" ON "proposals" USING btree ("inquiry_id") WHERE "proposals"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "proposals_inquiry_id_idx" ON "proposals" USING btree ("inquiry_id");