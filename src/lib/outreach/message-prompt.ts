import type { Language } from "@/lib/db/schema";
import { formatDateCompact } from "@/lib/format";
import type { Customer, Lead, OutcomeSegment } from "./types";

/**
 * The outreach message's prompt and guard rails (D17).
 *
 * Values-free and free of `server-only`, so the wording and the checks can be
 * unit tested; the model call lives in `message.ts`.
 */

export type MessageContext = {
  contactName: string;
  companyName: string | null;
  language: Language;
  outcome: OutcomeSegment;
  /** Plain sentences describing what they booked or asked about before. */
  history: string[];
  /** The rejection reason on their most recent rejected proposal, if any. */
  rejectionReason: string | null;
  /** ISO `YYYY-MM-DD` the event is expected to come round again. */
  nextExpectedDate: string;
  lastEventDate: string | null;
  lastEventType: string | null;
};

const LANGUAGE_NAME: Record<Language, string> = { en: "English", sv: "Swedish" };

/** How to open, given where we left things with this customer. */
const ANGLE: Record<OutcomeSegment, string> = {
  accepted:
    "They booked with you last time and it went ahead. Write as a warm return: you were glad to host them and would like to do it again.",
  rejected:
    "They turned down your last proposal. Acknowledge the reason plainly and without arguing, say briefly that things may look different this time, and leave the door open. Do not promise a specific price, discount or change.",
  quoted:
    "You sent them a proposal last time and never heard back either way. Do not press them about the silence or ask what happened — simply pick the thread back up and ask about this year.",
  no_proposal:
    "They asked about an event but you never sent a proposal. Keep it light: a short re-introduction and an offer to help if they are planning it again.",
};

const SYSTEM_PROMPT = `You write short, personal outreach messages for a hotel's event manager to send to a past customer.

You write as the hotel, to a customer. The company named alongside the recipient is THEIR employer, not the hotel — never welcome them "back to" their own company, and never sign off in its name.

The manager will read your draft, edit it, and send it themselves. Write the message body only — no subject line, no placeholders like [name], no signature.

Hard rules:
- Never state or imply a price, a rate, a total, a discount or an offer of money off.
- Never claim a date, a room or anything else is available, held or reserved. You do not know that.
- Never state the expected date as a booking. Put it as a question: ask whether they are planning the event around then.
- Open by referring to something specific from their history — the event they actually held or asked about, by name and roughly when.
- One clear ask: are they planning it again, and would they like you to put something together.
- Under 120 words. Warm and direct, not salesy. No exclamation marks beyond one at most.
- Write in the language you are told to use, in full and natural prose.`;

export function buildMessagePrompt(context: MessageContext): string {
  const {
    contactName,
    companyName,
    language,
    outcome,
    history,
    rejectionReason,
    nextExpectedDate,
  } = context;

  const parts = [
    `Write to: ${contactName}${companyName ? `, who works at ${companyName} (their company, not yours)` : ""}`,
    `Language: ${LANGUAGE_NAME[language]}`,
    `What happened before:\n${history.map((line) => `- ${line}`).join("\n")}`,
    `Angle: ${ANGLE[outcome]}`,
    `They are expected to want this again around ${formatDateCompact(nextExpectedDate)}. ` +
      `Ask about that timing as a question — do not assert it.`,
  ];

  if (rejectionReason) {
    parts.push(`Reason they gave for turning down the last proposal: "${rejectionReason}"`);
  }

  return parts.join("\n\n");
}

export { SYSTEM_PROMPT as MESSAGE_SYSTEM_PROMPT };

/**
 * Plain sentences describing a customer's history, for the prompt and for the
 * "History with us" panel to agree on the facts.
 */
export function describeHistory(customer: Customer): string[] {
  const lines: string[] = [];

  for (const inquiry of [...customer.inquiries].reverse()) {
    const dates = inquiry.events.map((event) => formatDateCompact(event.date));
    const types = [...new Set(inquiry.events.map((event) => event.type).filter(Boolean))];
    const what = types.length > 0 ? types.join(" and ") : "an event";
    const when = dates.length > 0 ? dates.join(", ") : "no date given";

    const settled = inquiry.proposals.filter(
      (proposal) => proposal.status === "accepted" || proposal.status === "rejected",
    );
    const outcome =
      settled.length > 0
        ? settled[settled.length - 1].status === "accepted"
          ? "they accepted the proposal"
          : "they turned the proposal down"
        : inquiry.proposals.length > 0
          ? "a proposal was sent but never answered"
          : "no proposal was ever sent";

    lines.push(`${what} on ${when} — ${outcome}`);
  }

  return lines;
}

/** Everything the drafter needs, assembled from a lead. */
export function buildMessageContext(lead: Lead): MessageContext {
  const { customer } = lead;
  const rejected = customer.inquiries
    .flatMap((inquiry) => inquiry.proposals)
    .filter((proposal) => proposal.status === "rejected" && proposal.rejectionReason)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    contactName: customer.contactName,
    companyName: customer.companyName,
    language: customer.language,
    outcome: customer.outcome,
    history: describeHistory(customer),
    rejectionReason: rejected?.rejectionReason ?? null,
    nextExpectedDate: lead.nextExpectedDate,
    lastEventDate: customer.lastEvent?.date ?? null,
    lastEventType: customer.lastEvent?.type ?? null,
  };
}

/** A rule the drafted message must not break. */
export type MessageWarning = { rule: "price" | "availability"; match: string };

/**
 * Deliberately narrow. The rejected-customer angle asks the model to repeat the
 * reason back — "the day rate came in above what the board had approved" — so
 * flagging bare words like "rate" or "price" fires on exactly the sentence we
 * asked for. What must never appear is an actual figure or an offer of money
 * off, and that is what these match.
 */
const PRICE_PATTERNS: RegExp[] = [
  // A number next to a currency, either order: "1 490 EUR", "€1,490", "450 kr".
  /(?:[€$£]\s?\d[\d\s.,]*)|(?:\d[\d\s.,]*\s?(?:eur|sek|usd|gbp|kr|kronor|euros?|dollars?|pounds?)\b)/i,
  // An offer of money off, with or without a figure.
  /\b(?:discount|discounted|rabatt|free of charge|kostnadsfri|special offer|reduced rate|better price|lower price|per person|per pers)\b/i,
];

const AVAILABILITY_PATTERNS: RegExp[] = [
  /\b(?:is available|are available|we have held|we have reserved|is reserved|are reserved|is booked for you|har reserverat|är reserverad|är ledig)\b/i,
];

/**
 * Checks a drafted message against the two rules that matter most.
 *
 * A warning is shown to the manager rather than blocking: they are the one who
 * sends it, and a false positive must not leave them with no draft at all.
 */
export function checkMessage(message: string): MessageWarning[] {
  const warnings: MessageWarning[] = [];

  for (const pattern of PRICE_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      warnings.push({ rule: "price", match: match[0].trim() });
      break;
    }
  }

  for (const pattern of AVAILABILITY_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      warnings.push({ rule: "availability", match: match[0].trim() });
      break;
    }
  }

  return warnings;
}

/** Words, for the under-120 rule. */
export function wordCount(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}
