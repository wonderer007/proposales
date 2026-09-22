import type { WorkingDraft } from "@/lib/builder/draft";
import type { InquiryWithEvents } from "@/lib/db/queries";
import { formatDate, formatDateRange, formatTime } from "@/lib/format";

/**
 * System prompt for the inquiry assistant.
 *
 * This deliverable supplies the context from SPEC §7.1; the behaviour rules in
 * §7.3 and the tool guidance arrive with the tools in D10.
 */

export type PromptContext = {
  inquiry: InquiryWithEvents;
  draft: WorkingDraft;
  /** `YYYY-MM-DD`, injected rather than read from the clock so it is testable. */
  today: string;
};

function describeFormDates(inquiry: InquiryWithEvents): string {
  if (inquiry.events.length === 0) return "No dates were given on the form.";

  return inquiry.events
    .map(
      (event) =>
        `- ${formatDateRange(event.date, event.endDate)}, ` +
        `${formatTime(event.startTime)}–${formatTime(event.endTime)}`,
    )
    .join("\n");
}

function describeDraft(draft: WorkingDraft): string {
  if (draft.events.length === 0 && draft.items.length === 0) {
    return "The working draft is empty.";
  }

  return JSON.stringify(
    {
      events: draft.events,
      items: draft.items.map((item) => ({
        id: item.id,
        eventId: item.eventId,
        variationId: item.variationId,
        title: item.title,
        unit: item.unit,
        quantity: item.quantity,
        quantitySource: item.quantitySource,
      })),
      requirements: draft.requirements,
      flags: draft.flags.map((flag) => flag.message),
      budget: draft.budget,
    },
    null,
    1,
  );
}

export function buildSystemPrompt({ inquiry, draft, today }: PromptContext): string {
  return `You are an assistant helping a hotel manager at Hotell Vasaparken turn a customer inquiry into a proposal.

Today is ${formatDate(today)}.

## Inquiry
Contact: ${inquiry.contactName}${inquiry.companyName ? ` (${inquiry.companyName})` : ""}
Email: ${inquiry.email}${inquiry.phone ? `\nPhone: ${inquiry.phone}` : ""}
Language: ${inquiry.language === "sv" ? "Swedish" : "English"}

Dates from the form:
${describeFormDates(inquiry)}

Original message:
"""
${inquiry.message}
"""

## Working draft
${describeDraft(draft)}

## How to behave
- You are talking to the hotel manager, not the customer. Be brief and concrete.
- Reply in the manager's language: ${inquiry.language === "sv" ? "Swedish" : "English"}.
- Always restate a date with its weekday, and ask the manager to confirm it using the checkbox on the Proposal Builder card.
- If a date, time or headcount is missing, ask the manager — never guess.
- You cannot create, update or version a proposal. Only the manager can, using the button on the card. Never claim a proposal was created.
- Quantities, prices and VAT are computed by the application, never by you.`;
}
