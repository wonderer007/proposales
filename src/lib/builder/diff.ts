import { formatDate, formatTime } from "@/lib/format";
import type { DraftEvent, WorkingDraft } from "./draft";

/**
 * A human-readable diff between two drafts, used to tell the manager what
 * changed since the active proposal and to refuse a no-op update (SPEC §6.4).
 */

function eventName(event: DraftEvent): string {
  return event.label ?? event.type;
}

function describeTimes(event: DraftEvent): string | null {
  if (!event.startTime || !event.endTime) return null;

  return `${formatTime(event.startTime)}–${formatTime(event.endTime)}`;
}

export function diffDrafts(before: WorkingDraft, after: WorkingDraft): string[] {
  const changes: string[] = [];

  const beforeEvents = new Map(before.events.map((event) => [event.id, event]));
  const afterEvents = new Map(after.events.map((event) => [event.id, event]));

  for (const event of after.events) {
    const previous = beforeEvents.get(event.id);

    if (!previous) {
      changes.push(`Added event: ${eventName(event)}`);
      continue;
    }

    if (previous.date !== event.date) {
      changes.push(
        `${eventName(event)}: date ${previous.date ? formatDate(previous.date) : "unset"} → ` +
          `${event.date ? formatDate(event.date) : "unset"}`,
      );
    }

    if (previous.headcount !== event.headcount) {
      changes.push(
        `${eventName(event)}: ${previous.headcount ?? "?"} → ${event.headcount ?? "?"} people`,
      );
    }

    const previousTimes = describeTimes(previous);
    const nextTimes = describeTimes(event);
    if (previousTimes !== nextTimes) {
      changes.push(`${eventName(event)}: ${previousTimes ?? "no time"} → ${nextTimes ?? "no time"}`);
    }
  }

  for (const event of before.events) {
    if (!afterEvents.has(event.id)) changes.push(`Removed event: ${eventName(event)}`);
  }

  const beforeItems = new Map(before.items.map((item) => [item.id, item]));
  const afterItems = new Map(after.items.map((item) => [item.id, item]));

  // An item removed and re-added keeps its product but changes id. Matching on
  // (event, product) as a fallback keeps that reading as one quantity change
  // rather than an unhelpful "Added X / Removed X" pair.
  const key = (item: { eventId: string; variationId: number }) =>
    `${item.eventId}:${item.variationId}`;
  const beforeByProduct = new Map(before.items.map((item) => [key(item), item]));
  const afterByProduct = new Map(after.items.map((item) => [key(item), item]));

  for (const item of after.items) {
    const previous = beforeItems.get(item.id) ?? beforeByProduct.get(key(item));

    if (!previous) {
      changes.push(`Added: ${item.title} × ${item.quantity}`);
      continue;
    }

    if (previous.quantity !== item.quantity) {
      changes.push(`${item.title}: ${previous.quantity} → ${item.quantity}`);
    }
    if (previous.unitPriceMinor !== item.unitPriceMinor) {
      changes.push(
        `${item.title}: unit price ${(previous.unitPriceMinor / 100).toFixed(2)} → ` +
          `${(item.unitPriceMinor / 100).toFixed(2)} ${item.currency}`,
      );
    }
  }

  for (const item of before.items) {
    if (!afterItems.has(item.id) && !afterByProduct.has(key(item))) {
      changes.push(`Removed: ${item.title}`);
    }
  }

  const beforeRequirements = new Set(before.requirements.map((r) => `${r.text}:${r.status}`));
  for (const requirement of after.requirements) {
    if (!beforeRequirements.has(`${requirement.text}:${requirement.status}`)) {
      changes.push(`Requirement "${requirement.text}" is ${requirement.status}`);
    }
  }

  if (before.language !== after.language) {
    changes.push(`Language: ${before.language} → ${after.language}`);
  }

  return changes;
}

/** True when nothing meaningful changed, so an update would be a no-op. */
export function draftsAreEquivalent(before: WorkingDraft, after: WorkingDraft): boolean {
  return diffDrafts(before, after).length === 0;
}
