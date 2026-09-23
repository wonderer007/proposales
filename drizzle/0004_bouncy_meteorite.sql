CREATE TABLE "proposal_templates" (
	"uuid" text PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"title" text NOT NULL,
	"language" text NOT NULL,
	"background_image_id" integer,
	"background_image_uuid" text,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
