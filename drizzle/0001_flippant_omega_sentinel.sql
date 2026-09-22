CREATE TABLE "content_catalog" (
	"variation_id" integer PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"title" text NOT NULL,
	"unit" text NOT NULL,
	"content_type" text NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"vat_rate" numeric(5, 4) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
