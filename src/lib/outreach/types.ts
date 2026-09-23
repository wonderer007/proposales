import type { EventType } from "@/lib/builder/draft";
import type { Cadence, CadenceSource, Language } from "@/lib/db/schema";
import type { InquiryStatus } from "@/lib/inquiry-status";

/**
 * Shapes the outreach radar works with (D17).
 *
 * Everything here is a plain value read out of Postgres before the pure
 * detection in `leads.ts` runs, so that module needs no database, no network
 * and no clock.
 */

/** One event on a past inquiry. The type is only known once the agent has drafted. */
export type HistoryEvent = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Last day of the range, or null for a single day. */
  endDate: string | null;
  /** From the working draft; null for an inquiry the agent never touched. */
  type: EventType | null;
};

/** One proposal version on a past inquiry. */
export type HistoryProposal = {
  version: number;
  /** Proposales status: `accepted`, `rejected`, `active`, … */
  status: string;
  /** Committed total excluding VAT, in minor units. */
  valueMinor: number;
  currency: string;
  rejectionReason: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

/** A past inquiry, flattened with everything the radar needs. */
export type HistoryInquiry = {
  id: string;
  contactName: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  language: Language;
  message: string;
  /** ISO timestamp, used to pick the customer's most recent inquiry. */
  createdAt: string;
  cadence: Cadence | null;
  cadenceConfidence: number | null;
  cadenceEvidence: string | null;
  cadenceSource: CadenceSource | null;
  events: HistoryEvent[];
  proposals: HistoryProposal[];
  /** Derived from the active proposal; shown in the history on Screen 2. */
  status: InquiryStatus;
};

/** A past outreach about one lead. */
export type OutreachContact = {
  customerKey: string;
  /** The expected date the nudge was about, ISO `YYYY-MM-DD`. */
  nextExpectedDate: string;
  /** ISO timestamp. */
  createdAt: string;
};

/**
 * Where we left things with this customer, from their most recent proposal of
 * any status. `quoted` is one we sent that was never answered either way.
 */
export type OutcomeSegment = "accepted" | "rejected" | "quoted" | "no_proposal";

/** Every inquiry from one customer, grouped by `customerKey`. */
export type Customer = {
  key: string;
  contactName: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  language: Language;
  /** Newest first. */
  inquiries: HistoryInquiry[];
  /** The cadence used for scheduling, after the confidence threshold. */
  cadence: Cadence;
  /** The classifier's own answer, even when confidence put it below the bar. */
  suggestedCadence: Cadence | null;
  cadenceConfidence: number | null;
  cadenceEvidence: string | null;
  cadenceSource: CadenceSource | null;
  outcome: OutcomeSegment;
  /** Most recent event on or before today, or null when they have no past event. */
  lastEvent: HistoryEvent | null;
  /** The customer's most recent proposal of any status. */
  lastProposal: HistoryProposal | null;
};

/** Why a customer is not on the radar. Useful on Screen 2 and in tests. */
export type LeadExclusion =
  | "no_past_event"
  | "cadence_not_schedulable"
  | "existing_inquiry"
  | "recently_contacted"
  | "outside_range";

/** A customer worth contacting inside the selected range. */
export type Lead = {
  customer: Customer;
  /** The inquiry the recommendation was derived from. */
  sourceInquiryId: string;
  /** ISO `YYYY-MM-DD`. */
  nextExpectedDate: string;
  /** ISO `YYYY-MM-DD`. */
  recommendedContactDate: string;
  /** One line of plain-language reasoning for Screen 2. */
  reasoning: string;
};

/** A customer the radar considered and rejected, with the reason. */
export type SkippedCustomer = {
  customer: Customer;
  reason: LeadExclusion;
};
