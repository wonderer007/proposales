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
    forGuests: (n: number) => `for ${n} guests`,
    notes: "Still to confirm",
    whatsChanged: "What's changed",
    arrangements: "How we have arranged it",
    extras: "Optional extras",
    extrasIntro: "Yours to include or leave out — the price above does not assume them.",
    rooms: (count: number, guests: number, names: string) =>
      `${count} rooms are reserved so all ${guests} guests are seated together: ${names}.`,
    roomsEachDay: (count: number, guests: number, names: string) =>
      `Each day, ${count} rooms are reserved so all ${guests} guests are seated together: ${names}.`,
    onDay: (day: string, detail: string) => `${day}: ${detail}`,
    overnight: (names: string) => `Overnight accommodation is included: ${names}.`,
    closing: "We look forward to welcoming you.",
    proposalFor: "Proposal",
  },
  sv: {
    greeting: (name: string) => `Hej ${name},`,
    intro: "Tack för din förfrågan. Här är vårt förslag:",
    schedule: "Program",
    guests: (n: number) => `${n} gäster`,
    forGuests: (n: number) => `för ${n} gäster`,
    notes: "Kvar att bekräfta",
    whatsChanged: "Det här har ändrats",
    arrangements: "Så har vi lagt upp det",
    extras: "Valfria tillägg",
    extrasIntro: "Ni väljer själva om de ska ingå — priset ovan förutsätter dem inte.",
    rooms: (count: number, guests: number, names: string) =>
      `${count} lokaler är bokade så att alla ${guests} gäster får plats tillsammans: ${names}.`,
    roomsEachDay: (count: number, guests: number, names: string) =>
      `Varje dag är ${count} lokaler bokade så att alla ${guests} gäster får plats tillsammans: ${names}.`,
    onDay: (day: string, detail: string) => `${day}: ${detail}`,
    overnight: (names: string) => `Övernattning ingår: ${names}.`,
    closing: "Vi ser fram emot att välkomna er.",
    proposalFor: "Offert",
  },
} as const;

/** The span the proposal covers, as one readable phrase. */
function describeDates(draft: WorkingDraft, language: WorkingDraft["language"]): string | null {
  const dates = draft.events
    .map((event) => event.date)
    .filter((date): date is string => date !== null)
    .sort();

  if (dates.length === 0) return null;

  const first = dates[0]!;
  const last = dates.at(-1)!;
  const locale = language === "sv" ? "sv-SE" : "en-GB";
  const render = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));

  if (first === last) return render(first);

  // Within one month, "18–20 November 2026" beats repeating the month and
  // year, and keeps the title from reading as three dashed clauses.
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  if (sameMonth) return `${Number(first.slice(8, 10))}–${render(last)}`;

  return `${render(first)} – ${render(last)}`;
}

/** The largest headcount across the events — what the proposal is sized for. */
function peakHeadcount(draft: WorkingDraft): number | null {
  const counts = draft.events
    .map((event) => event.headcount)
    .filter((count): count is number => count !== null && count > 0);

  return counts.length > 0 ? Math.max(...counts) : null;
}

/**
 * A title that says what this is, not what is in it.
 *
 * "Company meeting for 50 guests, 5 November 2026 – Brightloop Ltd" reads as a
 * proposal; listing the products does not, and repeats what the blocks below
 * already say.
 */
export function buildTitle(draft: WorkingDraft, inquiry: ProposalInquiry): string {
  const copy = COPY[draft.language];
  const who = inquiry.companyName ?? inquiry.contactName;

  // The longest event is the occasion; the rest are parts of it.
  const primary = [...draft.events].sort(
    (a, b) => (b.headcount ?? 0) - (a.headcount ?? 0),
  )[0];

  if (!primary) return `${copy.proposalFor} – ${who}`;

  const occasion = primary.label ?? primary.type;
  const guests = peakHeadcount(draft);
  const dates = describeDates(draft, draft.language);

  const parts = [occasion.charAt(0).toUpperCase() + occasion.slice(1)];
  if (guests !== null) parts.push(copy.forGuests(guests));
  if (dates) parts.push(`, ${dates}`);

  return `${parts.join(" ").replace(" ,", ",")} – ${who}`;
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

/**
 * Arrangements the customer should understand before reading prices.
 *
 * A block list shows *what* is booked; it does not explain *why* there are two
 * meeting rooms. Anything that would otherwise look like a mistake is spelled
 * out here.
 *
 * A multi-day event is several events sharing the same setup, so identical
 * arrangements are stated once — "Each day, 2 rooms…" rather than the same
 * sentence repeated per day.
 */
function describeArrangements(draft: WorkingDraft): string[] {
  const copy = COPY[draft.language];
  const lines: string[] = [];

  // Group events by the rooms booked for them, so one setup is one sentence.
  const byRoomSet = new Map<string, { event: DraftEvent; rooms: string[] }[]>();

  for (const event of draft.events) {
    const rooms = draft.items
      .filter((item) => item.eventId === event.id && item.contentType === "meetingRoom")
      .map((item) => item.title);

    if (rooms.length < 2) continue;

    const key = `${event.headcount ?? "?"}|${rooms.join("|")}`;
    byRoomSet.set(key, [...(byRoomSet.get(key) ?? []), { event, rooms }]);
  }

  for (const group of byRoomSet.values()) {
    const { event, rooms } = group[0]!;
    if (event.headcount === null) continue;

    const names = rooms.join(", ");

    if (group.length === 1) {
      // One day with this setup: name it only if other days differ.
      const detail = copy.rooms(rooms.length, event.headcount, names);
      lines.push(
        byRoomSet.size > 1 && event.date
          ? copy.onDay(`${event.label ?? event.type}, ${formatDate(event.date)}`, detail)
          : detail,
      );
      continue;
    }

    lines.push(copy.roomsEachDay(rooms.length, event.headcount, names));
  }

  const stays = [...new Set(
    draft.items
      .filter((item) => item.contentType === "accommodation")
      .map((item) => item.title),
  )];

  if (stays.length > 0) lines.push(copy.overnight(stays.join(", ")));

  return lines;
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

  const arrangements = describeArrangements(draft);
  if (arrangements.length > 0) {
    lines.push("", `**${copy.arrangements}**`);
    for (const line of arrangements) lines.push(`- ${line}`);
  }

  // Value-added services are a choice, so they are named rather than left to
  // be spotted among the priced lines.
  // The same extra booked for each day of a conference is one offer to the
  // customer, not several; the priced blocks below carry the quantities.
  const extras = new Map<string, string>();
  for (const item of draft.items) {
    if (item.role !== "addon") continue;
    if (!extras.has(item.title) || item.comment) {
      extras.set(item.title, item.comment ? ` — ${item.comment}` : "");
    }
  }

  if (extras.size > 0) {
    lines.push("", `**${copy.extras}**`, copy.extrasIntro);
    for (const [title, note] of extras) lines.push(`- ${title}${note}`);
  }

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
