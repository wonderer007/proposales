import { formatDate } from "@/lib/format";
import type { WorkingDraft } from "./draft";

/** Whether the draft may be turned into a proposal, and why not (SPEC §6.3). */
export type Readiness = { ready: boolean; reasons: string[] };

export type ReadinessOptions = {
  /** Variation ids currently in the content library. */
  knownVariationIds: ReadonlySet<number>;
  /** Today as `YYYY-MM-DD`; passed in to keep this pure. */
  today: string;
};

function eventName(event: { label?: string; type: string }, index: number): string {
  return event.label ?? `${event.type} (event ${index + 1})`;
}

export function checkReadiness(
  draft: WorkingDraft,
  { knownVariationIds, today }: ReadinessOptions,
): Readiness {
  const reasons: string[] = [];

  if (draft.events.length === 0) {
    return { ready: false, reasons: ["Add at least one event."] };
  }

  draft.events.forEach((event, index) => {
    const name = eventName(event, index);

    if (!event.date) reasons.push(`${name}: no date yet.`);
    else if (event.date < today) {
      reasons.push(`${name}: ${formatDate(event.date)} is in the past.`);
    }

    if (!event.startTime || !event.endTime) reasons.push(`${name}: start and end time are needed.`);
    if (event.headcount === null || event.headcount <= 0) {
      reasons.push(`${name}: how many guests?`);
    }
    if (event.date && !event.dateConfirmed) {
      reasons.push(`${name}: confirm the date with the checkbox.`);
    }

    const items = draft.items.filter((item) => item.eventId === event.id);
    if (items.length === 0) reasons.push(`${name}: nothing selected yet.`);

    items.forEach((item) => {
      if (!knownVariationIds.has(item.variationId)) {
        reasons.push(`"${item.title}" is no longer in the content library.`);
      }
      if (item.quantity <= 0) reasons.push(`"${item.title}": quantity must be more than zero.`);
    });
  });

  return { ready: reasons.length === 0, reasons };
}
