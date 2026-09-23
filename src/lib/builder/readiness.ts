import { formatDate } from "@/lib/format";
import { choiceGroups, type WorkingDraft } from "./draft";

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
    if (items.length === 0) {
      reasons.push(`${name}: nothing selected yet.`);
    } else if (items.every((item) => item.optional)) {
      // An event made entirely of optional items could be declined down to
      // nothing, which is not an offer (SPEC §6.5 rule 3) — unless the
      // customer is being asked to choose between alternatives, where picking
      // one is the point.
      const hasChoice = [...choiceGroups(draft, event.id).values()].some(
        (group) => group.length > 1,
      );

      if (!hasChoice) {
        reasons.push(`${name}: everything is optional — at least one item must be included.`);
      }
    }

    // A group of one is not a choice; it is an optional item mislabelled.
    for (const [groupName, group] of choiceGroups(draft, event.id)) {
      if (group.length < 2) {
        reasons.push(
          `${name}: "${groupName}" offers only ${group[0]?.title ?? "one option"} — ` +
            `a choice needs at least two.`,
        );
      }
    }

    items.forEach((item) => {
      if (!knownVariationIds.has(item.variationId)) {
        reasons.push(`"${item.title}" is no longer in the content library.`);
      }

      // An optional item may sit at zero; a committed one may not.
      if (item.quantity <= 0 && !item.optional) {
        reasons.push(`"${item.title}": quantity must be more than zero.`);
      }

      if (item.quantityEditable) {
        if (item.quantityMin === null && item.quantityMax === null) {
          reasons.push(`"${item.title}": flexible quantity needs a minimum or a maximum.`);
        }
        if (item.quantityMin !== null && item.quantity < item.quantityMin) {
          reasons.push(
            `"${item.title}": quantity ${item.quantity} is below the minimum of ${item.quantityMin}.`,
          );
        }
        if (item.quantityMax !== null && item.quantity > item.quantityMax) {
          reasons.push(
            `"${item.title}": quantity ${item.quantity} is above the maximum of ${item.quantityMax}.`,
          );
        }
        if (
          item.quantityMin !== null &&
          item.quantityMax !== null &&
          item.quantityMin > item.quantityMax
        ) {
          reasons.push(`"${item.title}": the minimum is above the maximum.`);
        }
      }
    });
  });

  return { ready: reasons.length === 0, reasons };
}
