import { listHistoryInquiries, listOutreachContacts } from "@/lib/db/queries/outreach";
import { evaluateCustomer, groupByCustomer } from "./leads";
import type { Customer, Lead, LeadExclusion } from "./types";

/**
 * One customer's page, reached from a lead row (D17).
 *
 * The customer is shown whether or not they are currently a lead: the manager
 * may have widened the range, marked them contacted, or followed an old link,
 * and "this customer no longer qualifies, here is why" is more useful than a
 * 404.
 */

export type LeadDetail = {
  customer: Customer;
  /** Present when the customer currently qualifies. */
  lead: Lead | null;
  /** Present instead when they do not. */
  exclusion: LeadExclusion | null;
};

export async function getLeadDetail(
  inquiryId: string,
  { today, from, to }: { today: string; from: string; to: string },
): Promise<LeadDetail | null> {
  const [inquiries, contacts] = await Promise.all([
    listHistoryInquiries(),
    listOutreachContacts(),
  ]);

  const customers = groupByCustomer(inquiries, today);
  const customer = customers.find((candidate) =>
    candidate.inquiries.some((inquiry) => inquiry.id === inquiryId),
  );

  if (!customer) return null;

  const evaluated = evaluateCustomer(customer, contacts, today, from, to);

  return "reason" in evaluated
    ? { customer, lead: null, exclusion: evaluated.reason }
    : { customer, lead: evaluated.lead, exclusion: null };
}

/** How an exclusion reads on the page. */
export const EXCLUSION_TEXT: Record<LeadExclusion, string> = {
  no_past_event: "This customer has no past event to predict from yet.",
  cadence_not_schedulable:
    "This customer's event is not one that repeats on a schedule, so it is never suggested.",
  existing_inquiry:
    "There is already an inquiry from this customer around the expected date, so they are not suggested again.",
  recently_contacted: "You reached out to this customer within the last 90 days.",
  outside_range: "Their recommended contact date falls outside the range you selected.",
};
