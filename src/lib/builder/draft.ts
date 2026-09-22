import { z } from "zod";

import { contentTypeSchema, unitSchema } from "@/lib/proposales/schemas";
import { quantityForUnit, type QuantityContext } from "./quantity";

/**
 * The working draft (SPEC §6.1): the shortlist shown on the Proposal Builder
 * card, edited by both the agent and the manager.
 *
 * Every operation here is pure — it returns a new draft and never touches the
 * database, the network or the clock. Ids are supplied by the caller so the
 * functions stay deterministic.
 */

export const eventTypeSchema = z.enum([
  "meeting",
  "conference",
  "breakfast",
  "lunch",
  "dinner",
  "fika",
  "accommodation",
  "other",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

/** Which of an event's values the agent inferred rather than being told. */
export const inferredFieldSchema = z.enum(["date", "time", "headcount"]);
export type InferredField = z.infer<typeof inferredFieldSchema>;

export const draftEventSchema = z.object({
  id: z.string(),
  type: eventTypeSchema,
  label: z.string().optional(),
  /** ISO `YYYY-MM-DD`. */
  date: z.string().nullable(),
  /** `HH:mm`. */
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  headcount: z.number().int().nullable(),
  inferred: z.array(inferredFieldSchema),
  /** Only the manager can set this true, via the checkbox on the card. */
  dateConfirmed: z.boolean(),
});
export type DraftEvent = z.infer<typeof draftEventSchema>;

export const draftItemSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  productId: z.number().int(),
  variationId: z.number().int(),
  title: z.string(),
  unit: unitSchema,
  contentType: contentTypeSchema,
  /** Price of one unit excluding VAT, in minor units. */
  unitPriceMinor: z.number().int(),
  /** VAT rate between 0 and 1. */
  vatRate: z.number(),
  currency: z.string(),
  quantity: z.number(),
  quantitySource: z.enum(["computed", "manual"]),
  note: z.string().optional(),
});
export type DraftItem = z.infer<typeof draftItemSchema>;

export const requirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(["matched", "unmatched"]),
  itemId: z.string().optional(),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const flagSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning"]),
  message: z.string(),
  eventId: z.string().optional(),
  itemId: z.string().optional(),
});
export type Flag = z.infer<typeof flagSchema>;

export const workingDraftSchema = z.object({
  language: z.enum(["en", "sv"]),
  events: z.array(draftEventSchema),
  items: z.array(draftItemSchema),
  requirements: z.array(requirementSchema),
  flags: z.array(flagSchema),
  budget: z.object({ amountMinor: z.number().int(), currency: z.string() }).nullable(),
});
export type WorkingDraft = z.infer<typeof workingDraftSchema>;

/** The catalog fields needed to put a product on the draft. */
export type CatalogProduct = {
  productId: number;
  variationId: number;
  title: string;
  unit: DraftItem["unit"];
  contentType: DraftItem["contentType"];
  unitPriceMinor: number;
  vatRate: number;
  currency: string;
};

export function emptyDraft(language: WorkingDraft["language"] = "en"): WorkingDraft {
  return { language, events: [], items: [], requirements: [], flags: [], budget: null };
}

/** Parses stored JSON, falling back to an empty draft when there is none. */
export function parseDraft(value: unknown, language: WorkingDraft["language"] = "en"): WorkingDraft {
  if (value == null) return emptyDraft(language);

  const result = workingDraftSchema.safeParse(value);

  return result.success ? result.data : emptyDraft(language);
}

// --------------------------------------------------------------------- flags

/** Flag ids are derived, not random, so re-running an operation cannot duplicate one. */
function quantityFlagId(itemId: string, kind: string): string {
  return `${itemId}:${kind}`;
}

const MANUAL_QUANTITY_KIND = "manual-quantity-stale";

function withoutItemFlags(flags: Flag[], itemId: string, kinds: string[]): Flag[] {
  const ids = new Set(kinds.map((kind) => quantityFlagId(itemId, kind)));

  return flags.filter((flag) => !ids.has(flag.id));
}

function upsertFlag(flags: Flag[], flag: Flag): Flag[] {
  const existing = flags.findIndex((candidate) => candidate.id === flag.id);
  if (existing === -1) return [...flags, flag];

  const next = [...flags];
  next[existing] = flag;

  return next;
}

// -------------------------------------------------------------------- events

function eventContext(event: DraftEvent): QuantityContext {
  return { headcount: event.headcount, startTime: event.startTime, endTime: event.endTime };
}

/**
 * Recomputes the quantities of one event's items.
 *
 * `computed` quantities are recalculated; `manual` ones are left exactly as the
 * manager set them but get a flag, so a headcount change cannot silently leave
 * a stale hand-typed number in the proposal.
 */
function recomputeEventItems(draft: WorkingDraft, event: DraftEvent): WorkingDraft {
  let flags = draft.flags;

  const items = draft.items.map((item) => {
    if (item.eventId !== event.id) return item;

    if (item.quantitySource === "manual") {
      flags = upsertFlag(flags, {
        id: quantityFlagId(item.id, MANUAL_QUANTITY_KIND),
        severity: "warning",
        message: `"${item.title}" has a manual quantity of ${item.quantity}; the event changed, so check it.`,
        eventId: event.id,
        itemId: item.id,
      });

      return item;
    }

    const { quantity, flag } = quantityForUnit(item.unit, eventContext(event));

    flags = withoutItemFlags(flags, item.id, ["confirm-nights", "review-quantity"]);
    if (flag) {
      flags = upsertFlag(flags, {
        id: quantityFlagId(item.id, flag.kind),
        severity: flag.severity,
        message: flag.message,
        eventId: event.id,
        itemId: item.id,
      });
    }

    return { ...item, quantity };
  });

  return { ...draft, items, flags };
}

/**
 * Adds an event, or updates one in place.
 *
 * Changing the date resets `dateConfirmed` (SPEC §6.1) — a confirmation only
 * ever applies to the date the manager actually saw. Changing the headcount or
 * the times recomputes the event's computed quantities.
 */
export function upsertEvent(
  draft: WorkingDraft,
  event: Omit<DraftEvent, "dateConfirmed">,
): WorkingDraft {
  const existing = draft.events.find((candidate) => candidate.id === event.id);

  if (!existing) {
    const created: DraftEvent = { ...event, dateConfirmed: false };

    return recomputeEventItems({ ...draft, events: [...draft.events, created] }, created);
  }

  const dateChanged = existing.date !== event.date;
  const next: DraftEvent = {
    ...event,
    dateConfirmed: dateChanged ? false : existing.dateConfirmed,
  };

  const events = draft.events.map((candidate) => (candidate.id === event.id ? next : candidate));
  const sizingChanged =
    existing.headcount !== event.headcount ||
    existing.startTime !== event.startTime ||
    existing.endTime !== event.endTime;

  const updated = { ...draft, events };

  return sizingChanged ? recomputeEventItems(updated, next) : updated;
}

/** Removes an event together with its items, flags and requirement links. */
export function removeEvent(draft: WorkingDraft, eventId: string): WorkingDraft {
  const removedItemIds = new Set(
    draft.items.filter((item) => item.eventId === eventId).map((item) => item.id),
  );

  return {
    ...draft,
    events: draft.events.filter((event) => event.id !== eventId),
    items: draft.items.filter((item) => item.eventId !== eventId),
    flags: draft.flags.filter(
      (flag) => flag.eventId !== eventId && !(flag.itemId && removedItemIds.has(flag.itemId)),
    ),
    requirements: draft.requirements.map((requirement) =>
      requirement.itemId && removedItemIds.has(requirement.itemId)
        ? { ...requirement, status: "unmatched" as const, itemId: undefined }
        : requirement,
    ),
  };
}

/** Sets or clears the manager's date confirmation. */
export function confirmDate(
  draft: WorkingDraft,
  eventId: string,
  confirmed: boolean,
): WorkingDraft {
  return {
    ...draft,
    events: draft.events.map((event) =>
      event.id === eventId ? { ...event, dateConfirmed: confirmed } : event,
    ),
  };
}

// --------------------------------------------------------------------- items

/** Adds a product to an event, sizing it from the unit rules. */
export function addItem(
  draft: WorkingDraft,
  { id, eventId, product, note }: { id: string; eventId: string; product: CatalogProduct; note?: string },
): WorkingDraft {
  const event = draft.events.find((candidate) => candidate.id === eventId);
  if (!event) return draft;

  const { quantity, flag } = quantityForUnit(product.unit, eventContext(event));

  const item: DraftItem = {
    id,
    eventId,
    productId: product.productId,
    variationId: product.variationId,
    title: product.title,
    unit: product.unit,
    contentType: product.contentType,
    unitPriceMinor: product.unitPriceMinor,
    vatRate: product.vatRate,
    currency: product.currency,
    quantity,
    quantitySource: "computed",
    ...(note ? { note } : {}),
  };

  const flags = flag
    ? upsertFlag(draft.flags, {
        id: quantityFlagId(id, flag.kind),
        severity: flag.severity,
        message: flag.message,
        eventId,
        itemId: id,
      })
    : draft.flags;

  return { ...draft, items: [...draft.items, item], flags };
}

/** Removes an item, its flags, and unlinks any requirement pointing at it. */
export function removeItem(draft: WorkingDraft, itemId: string): WorkingDraft {
  return {
    ...draft,
    items: draft.items.filter((item) => item.id !== itemId),
    flags: draft.flags.filter((flag) => flag.itemId !== itemId),
    requirements: draft.requirements.map((requirement) =>
      requirement.itemId === itemId
        ? { ...requirement, status: "unmatched" as const, itemId: undefined }
        : requirement,
    ),
  };
}

/** Overrides a quantity by hand. The line stops being recomputed from then on. */
export function setQuantity(draft: WorkingDraft, itemId: string, quantity: number): WorkingDraft {
  return {
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId ? { ...item, quantity, quantitySource: "manual" as const } : item,
    ),
    // The manager has just set this number, so any staleness warning is spent.
    flags: withoutItemFlags(draft.flags, itemId, [MANUAL_QUANTITY_KIND]),
  };
}

// ------------------------------------------------------- requirements, flags

export function setRequirements(draft: WorkingDraft, requirements: Requirement[]): WorkingDraft {
  return { ...draft, requirements };
}

export function addFlag(draft: WorkingDraft, flag: Flag): WorkingDraft {
  return { ...draft, flags: upsertFlag(draft.flags, flag) };
}

export function clearFlag(draft: WorkingDraft, flagId: string): WorkingDraft {
  return { ...draft, flags: draft.flags.filter((flag) => flag.id !== flagId) };
}

export function setBudget(draft: WorkingDraft, budget: WorkingDraft["budget"]): WorkingDraft {
  return { ...draft, budget };
}

/** Items belonging to one event, in insertion order. */
export function itemsForEvent(draft: WorkingDraft, eventId: string): DraftItem[] {
  return draft.items.filter((item) => item.eventId === eventId);
}
