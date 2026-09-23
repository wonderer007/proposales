import { formatDateCompact } from "@/lib/format";
import {
  CONTACTED_COOLDOWN_DAYS,
  LEAD_DAYS,
  NEARBY_INQUIRY_WINDOW_DAYS,
  addDays,
  effectiveCadence,
  isSchedulable,
  isWithinRange,
  nextExpectedDate,
  recommendedContactDate,
} from "./cadence";
import type {
  Customer,
  HistoryInquiry,
  HistoryProposal,
  Lead,
  OutcomeSegment,
  OutreachContact,
  SkippedCustomer,
} from "./types";

/**
 * Lead detection for the outreach radar (D17).
 *
 * Entirely pure: `today` and the selected range are parameters, so the whole
 * thing is unit testable and the reviewer can time-travel with `?today=`.
 */

/**
 * Identity for a customer across inquiries: lowercased email, falling back to
 * the company name when the email is missing.
 */
export function customerKey(email: string | null, companyName: string | null): string {
  const normalisedEmail = email?.trim().toLowerCase();
  if (normalisedEmail) return normalisedEmail;
  return companyName?.trim().toLowerCase() ?? "";
}

/** Groups past inquiries into customers, newest inquiry first within each. */
export function groupByCustomer(inquiries: HistoryInquiry[], today: string): Customer[] {
  const groups = new Map<string, HistoryInquiry[]>();

  for (const inquiry of inquiries) {
    const key = customerKey(inquiry.email, inquiry.companyName);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(inquiry);
    else groups.set(key, [inquiry]);
  }

  return [...groups].map(([key, group]) => {
    const byNewest = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const [newest] = byNewest;

    return {
      key,
      contactName: newest.contactName,
      email: newest.email,
      companyName: byNewest.find((inquiry) => inquiry.companyName)?.companyName ?? null,
      phone: byNewest.find((inquiry) => inquiry.phone)?.phone ?? null,
      language: newest.language,
      inquiries: byNewest,
      // The most recent inquiry speaks for the customer: if they used to book
      // quarterly and now book annually, the newer message is the truth.
      cadence: effectiveCadence(newest.cadence, newest.cadenceConfidence, newest.cadenceSource),
      suggestedCadence: newest.cadence,
      cadenceConfidence: newest.cadenceConfidence,
      cadenceEvidence: newest.cadenceEvidence,
      cadenceSource: newest.cadenceSource,
      outcome: outcomeSegment(byNewest),
      lastEvent: lastPastEvent(byNewest, today),
      lastProposal: latestProposal(byNewest),
    } satisfies Customer;
  });
}

/**
 * Where we left things with this customer.
 *
 * The most recent proposal decides, whatever its status: an unanswered quote
 * from last year is the truth about the relationship even if the year before
 * ended in an acceptance. Anything not settled reads as `quoted`, which is
 * honest about having been in touch without guessing how they felt.
 */
export function outcomeSegment(inquiries: HistoryInquiry[]): OutcomeSegment {
  const latest = latestProposal(inquiries);
  if (!latest) return "no_proposal";
  if (latest.status === "accepted") return "accepted";
  if (latest.status === "rejected") return "rejected";
  return "quoted";
}

/** The most recent event that has already happened — the one that sets the pattern. */
function lastPastEvent(inquiries: HistoryInquiry[], today: string) {
  return inquiries
    .flatMap((inquiry) => inquiry.events)
    .filter((event) => event.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function latestProposal(inquiries: HistoryInquiry[]): HistoryProposal | null {
  return (
    inquiries
      .flatMap((inquiry) => inquiry.proposals)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export type FindLeadsInput = {
  inquiries: HistoryInquiry[];
  contacts: OutreachContact[];
  /** ISO `YYYY-MM-DD`. */
  today: string;
  /** Selected range, inclusive at both ends. */
  from: string;
  to: string;
};

export type FindLeadsResult = {
  leads: Lead[];
  /** Everyone the radar looked at and passed over, with the reason. */
  skipped: SkippedCustomer[];
};

/**
 * Customers worth contacting inside `[from, to]`, sorted by recommended
 * contact date.
 */
export function findLeads({
  inquiries,
  contacts,
  today,
  from,
  to,
}: FindLeadsInput): FindLeadsResult {
  const customers = groupByCustomer(inquiries, today);
  const leads: Lead[] = [];
  const skipped: SkippedCustomer[] = [];

  for (const customer of customers) {
    const evaluated = evaluateCustomer(customer, contacts, today, from, to);
    if ("reason" in evaluated) skipped.push({ customer, reason: evaluated.reason });
    else leads.push(evaluated.lead);
  }

  leads.sort(
    (a, b) =>
      a.recommendedContactDate.localeCompare(b.recommendedContactDate) ||
      a.customer.contactName.localeCompare(b.customer.contactName),
  );

  return { leads, skipped };
}

type Evaluation = { lead: Lead } | { reason: SkippedCustomer["reason"] };

/**
 * Applies the exclusions in the order that gives the most useful reason: the
 * customer's own data first, then recent contact, then the range.
 */
export function evaluateCustomer(
  customer: Customer,
  contacts: OutreachContact[],
  today: string,
  from: string,
  to: string,
): Evaluation {
  if (!customer.lastEvent) return { reason: "no_past_event" };
  if (!isSchedulable(customer.cadence)) return { reason: "cadence_not_schedulable" };

  const expected = nextExpectedDate(customer.lastEvent.date, customer.cadence);
  const contactOn = recommendedContactDate(expected, customer.cadence);

  // We already have an inquiry for roughly that date, so the conversation has
  // happened — whatever came of it. A nudge would be noise.
  const windowStart = addDays(expected, -NEARBY_INQUIRY_WINDOW_DAYS);
  const windowEnd = addDays(expected, NEARBY_INQUIRY_WINDOW_DAYS);
  const hasNearbyInquiry = customer.inquiries.some((inquiry) =>
    inquiry.events.some((event) => isWithinRange(event.date, windowStart, windowEnd)),
  );
  if (hasNearbyInquiry) return { reason: "existing_inquiry" };

  const mine = contacts.filter((contact) => contact.customerKey === customer.key);

  const cooldownStart = addDays(today, -CONTACTED_COOLDOWN_DAYS);
  if (mine.some((contact) => contact.createdAt.slice(0, 10) >= cooldownStart)) {
    return { reason: "recently_contacted" };
  }

  if (!isWithinRange(contactOn, from, to)) return { reason: "outside_range" };

  return {
    lead: {
      customer,
      sourceInquiryId: customer.inquiries[0].id,
      nextExpectedDate: expected,
      recommendedContactDate: contactOn,
      reasoning: reasoningFor(customer, expected),
    },
  };
}

/** One line the manager can sanity-check the recommendation against. */
function reasoningFor(customer: Customer, expected: string): string {
  const event = customer.lastEvent;
  if (!event) return "";

  const what = event.type
    ? `${customer.cadence} ${event.type}`
    : `${customer.cadence} booking`;
  // Read from the same table the dates are computed with, so the sentence and
  // the maths cannot drift apart.
  const leadDays = isSchedulable(customer.cadence) ? LEAD_DAYS[customer.cadence] : 0;

  return `${what}, last held ${formatDateCompact(event.date)}, next expected ${formatDateCompact(
    expected,
  )} — contact ~${leadDays} days ahead.`;
}
