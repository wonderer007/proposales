import { z } from "zod";

/**
 * Zod schemas for the Proposales endpoints we use.
 *
 * Response schemas intentionally describe only the fields we read; Zod strips
 * the rest. Request schemas follow the OpenAPI document at
 * https://docs.proposales.com/openapi.json (version 2026.09.02).
 */

/** Text keyed by language code, e.g. `{ en: "Meeting room" }`. */
export const localizedTextSchema = z.record(z.string(), z.string());
export type LocalizedText = z.infer<typeof localizedTextSchema>;

/** Reads a localized string, falling back to the language the API defaulted to. */
export function pickLocalized(text: LocalizedText, language: string): string {
  return text[language] ?? text.en ?? Object.values(text)[0] ?? "";
}

// ---------------------------------------------------------------- companies

export const companySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  currency: z.string(),
  timezone: z.string(),
  /** Public inbox token, needed to create RFPs. Null when the inbox is off. */
  inbox_token: z.string().nullish(),
});
export type Company = z.infer<typeof companySchema>;

export const listCompaniesResponseSchema = z.object({ data: z.array(companySchema) });

// ------------------------------------------------------------------ content

export const contentItemSchema = z.object({
  product_id: z.number().int(),
  variation_id: z.number().int(),
  title: localizedTextSchema,
  description: localizedTextSchema,
  /** Unix seconds when archived, null while active. */
  deactivated_at: z.number().int().nullish(),
});
export type ContentItem = z.infer<typeof contentItemSchema>;

export const listContentResponseSchema = z.object({ data: z.array(contentItemSchema) });

/**
 * Either an Uploadcare `uuid`, or an empty `uuid` plus a public `url` that
 * Proposales downloads and re-hosts. Images that fail to download are silently
 * skipped by the API.
 */
export const contentImageInputSchema = z.object({
  uuid: z.string(),
  url: z.url().optional(),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
  size: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
  width: z.number().int().min(0).optional(),
});
export type ContentImageInput = z.infer<typeof contentImageInputSchema>;

export const createContentRequestSchema = z.object({
  company_id: z.number().int().min(1),
  language: z.string().min(2),
  title: z.string().min(1),
  description: z.string().optional(),
  images: z.array(contentImageInputSchema).optional(),
});
export type CreateContentRequest = z.infer<typeof createContentRequestSchema>;

export const contentMutationResponseSchema = z.object({
  data: z.object({
    product_id: z.number().int(),
    variation_id: z.number().int(),
    message: z.string(),
  }),
});
export type ContentMutationResponse = z.infer<typeof contentMutationResponseSchema>;

// ---------------------------------------------------------------------- RFP

export const createRfpRequestSchema = z
  .object({
    email: z.email(),
    company_name: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    phone_number: z.string().optional(),
    /** Shown in the request excerpt. */
    message: z.string().optional(),
    /** ISO 639-1, e.g. "en". Drives the confirmation email's language. */
    language: z.string().regex(/^[a-zA-Z]{2}$/).optional(),
    /** ISO 8601. */
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    /** Any non-empty value marks the RFP as a test. */
    is_test: z.string().optional(),
    /** Any non-empty value suppresses the confirmation email to the contact. */
    silent_confirmation: z.string().optional(),
  })
  // The endpoint keeps unknown string fields as proposal metadata.
  .catchall(z.string());
export type CreateRfpRequest = z.infer<typeof createRfpRequestSchema>;

export const createRfpResponseSchema = z.object({ id: z.number().int() });

// ----------------------------------------------------------------- proposals

/**
 * Units a product/block can be priced in, from the Proposal Block entity
 * reference. Note `sqm` exists and `week` does not, unlike SPEC §3.
 */
export const unitSchema = z.enum([
  "day",
  "h",
  "kg",
  "m",
  "month",
  "night",
  "person",
  "sqm",
  "unit",
  "year",
]);
export type Unit = z.infer<typeof unitSchema>;

/** Product categories, as used by `package_split.type`. */
export const contentTypeSchema = z.enum(["accommodation", "meetingRoom", "food", "other"]);
export type ContentType = z.infer<typeof contentTypeSchema>;

/** VAT split for a block. `vat` is a rate between 0 and 1. */
export const packageSplitSchema = z.object({
  type: contentTypeSchema,
  vat: z.number().min(0).max(1).optional(),
  /** Minor units (cents). */
  value_without_tax: z.number().optional(),
  value_with_tax: z.number().optional(),
  enable_discount: z.boolean().optional(),
  fixed: z.boolean().optional(),
});
export type PackageSplit = z.infer<typeof packageSplitSchema>;

export const proposalBlockInputSchema = z.object({
  /** The product's variation_id (SPEC §8). */
  content_id: z.number().int().optional(),
  type: z.enum(["product-block", "video-block"]),
  /** Preserves editor-owned changes when updating an existing block. */
  uuid: z.uuid().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  quantity: z.number().optional(),
  quantity_editable: z.boolean().optional(),
  /**
   * Documented on the Proposal Block entity but absent from the OpenAPI input
   * schema. Verified by round-trip on 2026-09-22: they persist and are
   * returned by Get Proposal. The block schema is not strict, so an unknown
   * field here would be silently ignored rather than rejected.
   */
  quantity_min: z.number().optional(),
  quantity_max: z.number().optional(),
  quantity_visible: z.boolean().optional(),
  comment: z.string().optional(),
  percent_discount: z.number().min(0).max(1).optional(),
  fixed_discount: z.number().min(0).optional(),
  optional: z.boolean().optional(),
  optional_picked: z.boolean().optional(),
  package_split: z.array(packageSplitSchema).optional(),
  /** All four unit values are per single unit, in minor units (cents). */
  unit_value_with_discount_with_tax: z.number().optional(),
  unit_value_with_discount_without_tax: z.number().optional(),
  unit_value_without_discount_with_tax: z.number().optional(),
  unit_value_without_discount_without_tax: z.number().optional(),
});
export type ProposalBlockInput = z.infer<typeof proposalBlockInputSchema>;

export const recipientInputSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  company_name: z.string().optional(),
});
export type RecipientInput = z.infer<typeof recipientInputSchema>;

export const taxOptionsSchema = z.object({
  mode: z.enum(["standard", "simplified", "tax-free", "none"]).optional(),
  tax_included: z.boolean().optional(),
  tax_label_key: z.string().optional(),
});

export const createProposalRequestSchema = z.object({
  company_id: z.number().int().min(1),
  language: z.string().min(1),
  title_md: z.string().optional(),
  description_md: z.string().optional(),
  contact_email: z.email().optional(),
  recipient: recipientInputSchema.optional(),
  /** Integration-defined metadata; we store the inquiry id, events, requirements. */
  data: z.record(z.string(), z.unknown()).optional(),
  tracking: z
    .object({
      created_from_rfp: z.number().int().min(1).optional(),
      created_from_template: z.uuid().optional(),
    })
    .optional(),
  tax_options: taxOptionsSchema.optional(),
  blocks: z.array(proposalBlockInputSchema).optional(),
});
export type CreateProposalRequest = z.infer<typeof createProposalRequestSchema>;

/** POST on an existing UUID reuses the create body. */
export const createProposalVersionRequestSchema = createProposalRequestSchema;
export type CreateProposalVersionRequest = CreateProposalRequest;

/**
 * PATCH requires `company_id` plus at least one other field. `blocks` replaces
 * the full ordered list; `title`, `description` and `image_uuids` on a block
 * are ignored by this operation.
 */
export const updateProposalDraftRequestSchema = createProposalRequestSchema
  .omit({ language: true, tracking: true })
  .extend({ language: z.string().min(1).optional() })
  .refine((body) => Object.keys(body).length >= 2, {
    message: "A draft update needs company_id and at least one field to change",
  });
export type UpdateProposalDraftRequest = z.infer<typeof updateProposalDraftRequestSchema>;

export const proposalStatusSchema = z.enum([
  "accepted",
  "replaced",
  "active",
  "draft",
  "expired",
  "rejected",
  "template",
  "withdrawn",
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalSchema = z.object({
  uuid: z.string(),
  status: proposalStatusSchema.nullable(),
  /** Version within the series; null for the first. */
  version: z.number().int().nullish(),
  series_uuid: z.string().optional(),
  language: z.string(),
  currency: z.string().optional(),
  /** Minor units (cents). */
  value_with_tax: z.number().optional(),
  value_without_tax: z.number().optional(),
  status_changed_at: z.number().int().optional(),
  updated_at: z.number().int().optional(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const getProposalResponseSchema = z.object({ data: proposalSchema });

export const proposalMutationResponseSchema = z.object({
  proposal: z.object({ uuid: z.string(), url: z.string() }),
});
export type ProposalMutationResponse = z.infer<typeof proposalMutationResponseSchema>;

// -------------------------------------------------------------------- errors

export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    issues: z
      .array(
        z.object({
          code: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});
export type ErrorResponseBody = z.infer<typeof errorResponseSchema>;
