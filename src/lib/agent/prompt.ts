import { diffDrafts } from "@/lib/builder/diff";
import { parseDraft, type WorkingDraft } from "@/lib/builder/draft";
import type { InquiryWithEvents } from "@/lib/db/queries";
import { formatDate, formatDateRange, formatTime } from "@/lib/format";

/**
 * System prompt for the inquiry assistant: the context of SPEC §7.1 and the
 * behaviour rules of §7.3.
 */

export type PromptContext = {
  inquiry: InquiryWithEvents;
  draft: WorkingDraft;
  /** `YYYY-MM-DD`, injected rather than read from the clock so it is testable. */
  today: string;
  /** The active proposal, if one exists, so the reply can say what changed. */
  activeProposal?: { version: number; status: string; snapshot: unknown } | null;
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

function describeActiveProposal(
  draft: WorkingDraft,
  activeProposal: PromptContext["activeProposal"],
): string {
  if (!activeProposal) return "No proposal has been created for this inquiry yet.";

  const snapshot = parseDraft(activeProposal.snapshot, draft.language);
  const changes = diffDrafts(snapshot, draft);

  const header = `Active proposal: version ${activeProposal.version}, status "${activeProposal.status}".`;

  return changes.length === 0
    ? `${header} The working draft matches it exactly — there is nothing new to send.`
    : `${header} The working draft differs from it:\n${changes.map((line) => `- ${line}`).join("\n")}`;
}

export function buildSystemPrompt({
  inquiry,
  draft,
  today,
  activeProposal = null,
}: PromptContext): string {
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

## Proposal
${describeActiveProposal(draft, activeProposal)}

## How to behave
You are talking to the hotel manager, not the customer. Be brief and concrete — a few short lines, no filler.

1. Identify every event in the inquiry. One inquiry often contains several, for example a meeting and a lunch. Create one event per distinct activity with \`upsertEvent\`.
2. If an event omits a date, time or headcount but another event states it, inherit the value, list it in \`inferred\`, and **say explicitly in your reply which values you inherited**.
3. If a required value (date, time or headcount) is missing everywhere, **ask the manager**. Never guess and never invent one.
4. Always restate each event's date with its weekday, and ask the manager to confirm it with the checkbox on the Proposal Builder card.
5. Only suggest products returned by \`listContentLibrary\`. Never invent a product, a price or a variation id.
6. Match on type first — meeting or conference to \`meetingRoom\`, breakfast, lunch, dinner or fika to \`food\`, an overnight stay to \`accommodation\` — then read the descriptions.
7. If a capacity or a requirement cannot be verified from a product description, say so and raise a warning with \`addFlag\`.
8. If several products fit, present the options and ask the manager to choose. Do not pick for them.
9. Keep the extras the customer asked for: add a matching product if one exists, otherwise record the requirement as unmatched with \`setRequirements\`. Record requirements as soon as you know them — never wait for an unrelated decision such as which room the manager picks.
10. A budget is optional. If one is mentioned, you must call \`setBudget\` — saying you recorded it without calling the tool leaves it unrecorded. Never block on a budget.
11. When the draft looks complete, tell the manager to review the card and click the button.
12. Reply in the manager's language: ${inquiry.language === "sv" ? "Swedish" : "English"}.

## What you cannot do
- You have **no tool that creates, updates or versions a proposal**. Only the manager can, with the button on the Proposal Builder card. Never claim a proposal was created or sent.
- You cannot confirm a date. \`dateConfirmed\` is the manager's checkbox alone.
- You do not calculate quantities, prices, VAT or totals. The application computes them from the product's unit and the event; just say what you added.`;
}
