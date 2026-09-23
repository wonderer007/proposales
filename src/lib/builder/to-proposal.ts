import { formatDate, formatTime } from "@/lib/format";
import type { CreateProposalRequest, ProposalBlockInput } from "@/lib/proposales/schemas";
import { splitName } from "@/lib/inquiries/rfp";
import type { DraftEvent, DraftItem, WorkingDraft } from "./draft";

/**
 * Maps an inquiry and its working draft onto a Proposales proposal (SPEC §8).
 *
 * Pure: it takes everything it needs as arguments and returns the request body.
 * Pricing is sent on every block because the content library cannot store it.
 */

export type ProposalInquiry = {
  id: string;
  contactName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  rfpId: number | null;
};

export type ToProposalConfig = { companyId: number };

const COPY = {
  en: {
    greeting: (name: string) => `Dear ${name},`,
    intro: "Thank you for your enquiry. Here is our proposal:",
    schedule: "Schedule",
    guests: (n: number) => `${n} guests`,
    notes: "Still to confirm",
    whatsChanged: "What's changed",
    closing: "We look forward to welcoming you.",
  },
  sv: {
    greeting: (name: string) => `Hej ${name},`,
    intro: "Tack för din förfrågan. Här är vårt förslag:",
    schedule: "Program",
    guests: (n: number) => `${n} gäster`,
    notes: "Kvar att bekräfta",
    whatsChanged: "Det här har ändrats",
    closing: "Vi ser fram emot att välkomna er.",
  },
} as const;

/** "Company meeting with lunch – Northstar Consulting" */
export function buildTitle(draft: WorkingDraft, inquiry: ProposalInquiry): string {
  const labels = draft.events.map((event) => event.label ?? event.type);
  const unique = [...new Set(labels)];

  const subject =
    unique.length === 0
      ? "Proposal"
      : unique.length === 1
        ? unique[0]!
        : `${unique.slice(0, -1).join(", ")} with ${unique.at(-1)}`;

  const who = inquiry.companyName ?? inquiry.contactName;

  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} – ${who}`;
}

function describeEvent(event: DraftEvent, language: WorkingDraft["language"]): string {
  const copy = COPY[language];
  const parts: string[] = [event.label ?? event.type];

  if (event.date) parts.push(formatDate(event.date));
  if (event.startTime && event.endTime) {
    parts.push(`${formatTime(event.startTime)}–${formatTime(event.endTime)}`);
  }
  if (event.headcount !== null) parts.push(copy.guests(event.headcount));

  return `- ${parts.join(", ")}`;
}

export function buildDescription(draft: WorkingDraft, inquiry: ProposalInquiry): string {
  const copy = COPY[draft.language];
  const { first_name } = splitName(inquiry.contactName);

  const lines = [copy.greeting(first_name), "", copy.intro, ""];

  // A revision leads with what moved, so the customer sees it before the
  // schedule they have already read once (D14).
  if (draft.revisionNote) {
    lines.push(`**${copy.whatsChanged}**`, draft.revisionNote, "");
  }

  lines.push(`**${copy.schedule}**`);

  for (const event of draft.events) lines.push(describeEvent(event, draft.language));

  const unmatched = draft.requirements.filter((requirement) => requirement.status === "unmatched");
  if (unmatched.length > 0) {
    lines.push("", `**${copy.notes}**`);
    for (const requirement of unmatched) lines.push(`- ${requirement.text}`);
  }

  lines.push("", copy.closing);

  return lines.join("\n");
}

/**
 * One product block per item.
 *
 * `content_id` is the variation id (SPEC §8). All four unit values are sent
 * because the library holds no prices, and `package_split` carries the VAT
 * rate. We apply no discounts, so the with- and without-discount values match.
 */
export function buildBlock(item: DraftItem): ProposalBlockInput {
  const exclVat = item.unitPriceMinor;
  const inclVat = Math.round(exclVat * (1 + item.vatRate));

  const block: ProposalBlockInput = {
    type: "product-block",
    content_id: item.variationId,
    quantity: item.quantity,
    currency: item.currency,
    unit_value_without_discount_without_tax: exclVat,
    unit_value_with_discount_without_tax: exclVat,
    unit_value_without_discount_with_tax: inclVat,
    unit_value_with_discount_with_tax: inclVat,
    package_split: [
      {
        type: item.contentType,
        vat: item.vatRate,
        value_without_tax: exclVat,
        value_with_tax: inclVat,
      },
    ],
  };

  if (item.optional) {
    block.optional = true;
    block.optional_picked = item.optionalPicked;
  }

  if (item.quantityEditable) {
    block.quantity_editable = true;
    // A quantity the recipient can change has to be one they can see, so this
    // follows the toggle rather than being a setting of its own.
    block.quantity_visible = true;
    if (item.quantityMin !== null) block.quantity_min = item.quantityMin;
    if (item.quantityMax !== null) block.quantity_max = item.quantityMax;
  }

  if (item.comment) block.comment = item.comment;

  // Discounts are modelled here but only applied in D15. The undiscounted unit
  // values above are deliberate: Proposales applies the reduction itself, so
  // sending an already-reduced unit value would double-count it.
  if (item.discount) {
    if (item.discount.type === "percent") block.percent_discount = item.discount.value;
    else block.fixed_discount = item.discount.value;
  }

  return block;
}

export function toProposalRequest(
  inquiry: ProposalInquiry,
  draft: WorkingDraft,
  { companyId }: ToProposalConfig,
): CreateProposalRequest {
  const { first_name, last_name } = splitName(inquiry.contactName);

  const body: CreateProposalRequest = {
    company_id: companyId,
    language: draft.language,
    title_md: buildTitle(draft, inquiry),
    description_md: buildDescription(draft, inquiry),
    recipient: {
      first_name,
      ...(last_name ? { last_name } : {}),
      email: inquiry.email,
      ...(inquiry.phone ? { phone: inquiry.phone } : {}),
      ...(inquiry.companyName ? { company_name: inquiry.companyName } : {}),
    },
    data: {
      inquiry_id: inquiry.id,
      events: draft.events,
      requirements: draft.requirements,
    },
    blocks: draft.items.map(buildBlock),
  };

  if (inquiry.rfpId) body.tracking = { created_from_rfp: inquiry.rfpId };

  return body;
}
