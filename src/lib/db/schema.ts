import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ContentType, Unit } from "@/lib/proposales/schemas";

/** Languages a proposal can be written in. */
export type Language = "en" | "sv";

/** Why a customer turned a proposal down (SPEC §5). */
export type RejectionCategory =
  | "price"
  | "availability"
  | "scope"
  | "timing"
  | "competitor"
  | "no_reason"
  | "other";

/** Roles persisted for chat messages (AI SDK `UIMessage.role`). */
export type MessageRole = "system" | "user" | "assistant";

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    companyName: text("company_name"),
    message: text("message").notNull(),
    language: text("language").$type<Language>().notNull().default("en"),
    /** Proposales RFP id, once the inquiry has been mirrored. */
    rfpId: integer("rfp_id"),
    /** Last RFP sync failure, surfaced as a "Retry sync" action. */
    rfpSyncError: text("rfp_sync_error"),
    /** `WorkingDraft` (SPEC §6.1); typed once `src/lib/builder/draft.ts` lands in D7. */
    workingDraft: jsonb("working_draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inquiries_email_lower_idx").on(sql`lower(${table.email})`),
    index("inquiries_contact_name_lower_idx").on(sql`lower(${table.contactName})`),
    index("inquiries_created_at_idx").on(table.createdAt),
  ],
);

/** Dates and times as entered on the inquiry form. */
export const inquiryEvents = pgTable(
  "inquiry_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    /** First day of the range, ISO `YYYY-MM-DD`. */
    date: date("date", { mode: "string" }).notNull(),
    /** Last day of the range; null when the range is a single day. */
    endDate: date("end_date", { mode: "string" }),
    /** `HH:mm` on the first day, stored as Postgres `time`. */
    startTime: time("start_time").notNull(),
    /** `HH:mm` on the last day. */
    endTime: time("end_time").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("inquiry_events_inquiry_id_idx").on(table.inquiryId),
    unique("inquiry_events_inquiry_id_position_key").on(table.inquiryId, table.position),
  ],
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    proposalesUuid: text("proposales_uuid").notNull().unique(),
    proposalesUrl: text("proposales_url").notNull(),
    /** 1, 2, 3 … per inquiry. */
    version: integer("version").notNull(),
    /** Mirrored from Proposales; exact values confirmed in D2. */
    status: text("status").notNull(),
    /** The `WorkingDraft` this version was created from. */
    snapshot: jsonb("snapshot").notNull(),
    /**
     * What the recipient did with this version in Proposales: per-block
     * `optional_picked` and any quantity they set themselves (SPEC §5).
     */
    recipientSelections: jsonb("recipient_selections"),
    /** "What's changed" summary shown with this version. */
    versionNote: text("version_note"),
    /** Filled when a proposal comes back rejected (D15). */
    rejectionReason: text("rejection_reason"),
    rejectionCategory: text("rejection_category").$type<RejectionCategory>(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    statusCheckedAt: timestamp("status_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("proposals_inquiry_id_version_key").on(table.inquiryId, table.version),
    /** At most one active (non-superseded) proposal per inquiry. */
    uniqueIndex("proposals_one_active_per_inquiry_idx")
      .on(table.inquiryId)
      .where(sql`${table.supersededAt} is null`),
    index("proposals_inquiry_id_idx").on(table.inquiryId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    /** AI SDK message id. */
    id: text("id").primaryKey(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    role: text("role").$type<MessageRole>().notNull(),
    /** AI SDK `UIMessage.parts`. */
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_inquiry_id_created_at_idx").on(table.inquiryId, table.createdAt)],
);

/**
 * Pricing for content-library products.
 *
 * The Proposales content API stores only title, description and images — it has
 * no price, unit, VAT or type, and rejects them on create. So the hotel's
 * pricing lives here, keyed by the `variation_id` the API returns, and is sent
 * explicitly on each proposal block when a proposal is created.
 */
export const contentCatalog = pgTable("content_catalog", {
  /** Proposales variation id; each product has exactly one variation. */
  variationId: integer("variation_id").primaryKey(),
  productId: integer("product_id").notNull(),
  /** Title as seeded, for readable diagnostics and title-based backfill. */
  title: text("title").notNull(),
  unit: text("unit").$type<Unit>().notNull(),
  contentType: text("content_type").$type<ContentType>().notNull(),
  /** Price for one unit, excluding VAT, in minor units (cents). */
  unitPriceMinor: integer("unit_price_minor").notNull(),
  /** VAT rate between 0 and 1, e.g. 0.25. */
  vatRate: numeric("vat_rate", { precision: 5, scale: 4, mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Proposal templates mirrored from Proposales (never created by us).
 *
 * A template is itself a proposal with `status: "template"`. We keep a local
 * copy so the agent can match one by title without a round trip, and so the
 * list is stable between syncs.
 */
export const proposalTemplates = pgTable("proposal_templates", {
  /** The template proposal's uuid in Proposales. */
  uuid: text("uuid").primaryKey(),
  companyId: integer("company_id").notNull(),
  title: text("title").notNull(),
  language: text("language").notNull(),
  /** Carried onto proposals built from this template. */
  backgroundImageId: integer("background_image_id"),
  backgroundImageUuid: text("background_image_uuid"),
  /** Attachment ids to copy, e.g. terms and conditions. */
  attachmentIds: jsonb("attachment_ids").$type<number[]>().notNull().default([]),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProposalTemplate = typeof proposalTemplates.$inferSelect;
export type NewProposalTemplate = typeof proposalTemplates.$inferInsert;

export type Inquiry = typeof inquiries.$inferSelect;
export type NewInquiry = typeof inquiries.$inferInsert;
export type InquiryEvent = typeof inquiryEvents.$inferSelect;
export type NewInquiryEvent = typeof inquiryEvents.$inferInsert;
export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type CatalogEntry = typeof contentCatalog.$inferSelect;
export type NewCatalogEntry = typeof contentCatalog.$inferInsert;
