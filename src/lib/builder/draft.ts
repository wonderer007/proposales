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

/** How sure we are of an event's headcount (SPEC §6.5 rule 1). */
export const headcountCertaintySchema = z.enum(["confirmed", "estimated"]);
export type HeadcountCertainty = z.infer<typeof headcountCertaintySchema>;

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
  /** "estimated" when the inquiry hedges ("around 30", "12, maybe 14"). */
  headcountCertainty: headcountCertaintySchema.default("confirmed"),
  headcountMin: z.number().int().nullable().default(null),
  headcountMax: z.number().int().nullable().default(null),
});
export type DraftEvent = z.infer<typeof draftEventSchema>;

/** A core item is part of the offer; an add-on is a value-added extra. */
export const itemRoleSchema = z.enum(["core", "addon"]);
export type ItemRole = z.infer<typeof itemRoleSchema>;

/** Percent is 0–1; fixed is minor units, applied excluding tax. */
export const discountSchema = z.object({
  type: z.enum(["percent", "fixed"]),
  value: z.number().min(0),
});
export type Discount = z.infer<typeof discountSchema>;

/**
 * Settings the agent proposed but the manager has not accepted.
 *
 * Not in SPEC §6.1's field list, but the behaviour there needs somewhere to
 * hold an unapplied idea: an `agent_suggestion` must not change what the
 * customer would receive until the manager clicks Apply on the card.
 */
export const itemSuggestionSchema = z.object({
  role: itemRoleSchema.optional(),
  optional: z.boolean().optional(),
  quantityEditable: z.boolean().optional(),
  quantityMin: z.number().nullable().optional(),
  quantityMax: z.number().nullable().optional(),
  comment: z.string().optional(),
  /** Why the agent suggested it; shown beside the Apply button. */
  rationale: z.string(),
});
export type ItemSuggestion = z.infer<typeof itemSuggestionSchema>;

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

  // --- optional & flexible products (SPEC §6.5) ------------------------------
  role: itemRoleSchema.default("core"),
  /** The recipient may deselect this item in Proposales. */
  optional: z.boolean().default(false),
  /** Whether an optional item starts selected. */
  optionalPicked: z.boolean().default(false),
  /** The recipient may change the quantity, within the bounds below. */
  quantityEditable: z.boolean().default(false),
  quantityMin: z.number().nullable().default(null),
  quantityMax: z.number().nullable().default(null),
  /** Applying a discount is D15; the model carries it from here. */
  discount: discountSchema.nullable().default(null),
  policyOverride: z.object({ reason: z.string(), at: z.string() }).nullable().default(null),
  /** Shown to the recipient on the block. */
  comment: z.string().optional(),
  /**
   * Items sharing a name are alternatives: the customer picks one of them.
   *
   * "A room with a projector for 30" can be answered by two rooms. Offering
   * both as plain optional lines would let the customer decline both; a choice
   * group says exactly one is expected, and the totals and readiness rules
   * treat it that way.
   */
  choiceGroup: z.string().nullable().default(null),
  /** An agent proposal awaiting the manager's Apply (see above). */
  suggested: itemSuggestionSchema.nullable().default(null),
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
  /** "recovery" after a rejection (D15). */
  mode: z.enum(["normal", "recovery"]).default("normal"),
  /** "What's changed" text for the next version (D14). */
  revisionNote: z.string().nullable().default(null),
  /**
   * The Proposales template this proposal is built from. Templates are only
   * ever chosen, never created — the uuid must exist in `proposal_templates`.
   */
  template: z
    .object({ uuid: z.string(), title: z.string() })
    .nullable()
    .default(null),
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
  return {
    language,
    mode: "normal",
    revisionNote: null,
    template: null,
    events: [],
    items: [],
    requirements: [],
    flags: [],
    budget: null,
  };
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
 * What a caller supplies to `upsertEvent`.
 *
 * The headcount-certainty fields are optional so existing callers, and the
 * agent's tool schema, do not have to restate them on every edit.
 */
export type UpsertEventInput = Omit<
  DraftEvent,
  "dateConfirmed" | "headcountCertainty" | "headcountMin" | "headcountMax"
> &
  Partial<Pick<DraftEvent, "headcountCertainty" | "headcountMin" | "headcountMax">>;

/**
 * Adds an event, or updates one in place.
 *
 * Changing the date resets `dateConfirmed` (SPEC §6.1) — a confirmation only
 * ever applies to the date the manager actually saw. Changing the headcount or
 * the times recomputes the event's computed quantities.
 */
export function upsertEvent(draft: WorkingDraft, event: UpsertEventInput): WorkingDraft {
  const existing = draft.events.find((candidate) => candidate.id === event.id);

  const certainty = {
    headcountCertainty: event.headcountCertainty ?? existing?.headcountCertainty ?? "confirmed",
    headcountMin: event.headcountMin ?? existing?.headcountMin ?? null,
    headcountMax: event.headcountMax ?? existing?.headcountMax ?? null,
  };

  if (!existing) {
    const created: DraftEvent = { ...event, ...certainty, dateConfirmed: false };

    return recomputeEventItems({ ...draft, events: [...draft.events, created] }, created);
  }

  const dateChanged = existing.date !== event.date;
  const next: DraftEvent = {
    ...event,
    ...certainty,
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
  {
    id,
    eventId,
    product,
    note,
    role = "core",
  }: {
    id: string;
    eventId: string;
    product: CatalogProduct;
    note?: string;
    /** Add-ons default to optional and flexible from zero (SPEC §6.5 rule 2). */
    role?: ItemRole;
  },
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

    role,
    // A value-added service is offered, not assumed: optional, and adjustable
    // down to zero. Core items stay fixed unless the manager says otherwise.
    optional: role === "addon",
    optionalPicked: false,
    quantityEditable: role === "addon",
    quantityMin: role === "addon" ? 0 : null,
    quantityMax: role === "addon" ? quantity : null,
    discount: null,
    policyOverride: null,
    choiceGroup: null,
    suggested: null,
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

/**
 * Drops warnings left stranded by removing an item.
 *
 * Flags scoped to the item go by id. Flags that merely *mention* the product —
 * an agent warning like "Vasa Room may be too small" attached to the event
 * rather than the line — would otherwise linger and describe something that is
 * no longer being offered. They are dropped too, unless another line still
 * carries the same product.
 */
function withoutStrandedFlags(flags: Flag[], removed: DraftItem, remaining: DraftItem[]): Flag[] {
  const stillOffered = remaining.some(
    (item) => item.title.toLowerCase() === removed.title.toLowerCase(),
  );

  return flags.filter((flag) => {
    if (flag.itemId === removed.id) return false;
    if (stillOffered || flag.itemId) return true;

    return !flag.message.toLowerCase().includes(removed.title.toLowerCase());
  });
}

/** Removes an item, its flags, and unlinks any requirement pointing at it. */
export function removeItem(draft: WorkingDraft, itemId: string): WorkingDraft {
  const removed = draft.items.find((item) => item.id === itemId);
  if (!removed) return draft;

  const items = draft.items.filter((item) => item.id !== itemId);

  return {
    ...draft,
    items,
    flags: withoutStrandedFlags(draft.flags, removed, items),
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

/** The alternatives on an event, grouped by choice name. */
export function choiceGroups(draft: WorkingDraft, eventId: string): Map<string, DraftItem[]> {
  const groups = new Map<string, DraftItem[]>();

  for (const item of draft.items) {
    if (item.eventId !== eventId || !item.choiceGroup) continue;
    groups.set(item.choiceGroup, [...(groups.get(item.choiceGroup) ?? []), item]);
  }

  return groups;
}

/** Items belonging to one event, in insertion order. */
export function itemsForEvent(draft: WorkingDraft, eventId: string): DraftItem[] {
  return draft.items.filter((item) => item.eventId === eventId);
}

// ------------------------------------------------- optional & flexible items

/** The presentation settings the manager (or the agent) can change per item. */
export type ItemOptions = {
  role?: ItemRole;
  optional?: boolean;
  optionalPicked?: boolean;
  quantityEditable?: boolean;
  quantityMin?: number | null;
  quantityMax?: number | null;
  comment?: string;
  choiceGroup?: string | null;
};

/**
 * Applies option changes to an item directly.
 *
 * This is the *applied* path: what the manager asked for, or what they
 * accepted from a suggestion. Turning flexible quantity off clears its bounds
 * so a stale range cannot be sent to Proposales.
 */
export function setItemOptions(
  draft: WorkingDraft,
  itemId: string,
  options: ItemOptions,
): WorkingDraft {
  return {
    ...draft,
    items: draft.items.map((item) => {
      if (item.id !== itemId) return item;

      const next: DraftItem = {
        ...item,
        ...(options.role !== undefined ? { role: options.role } : {}),
        ...(options.optional !== undefined ? { optional: options.optional } : {}),
        ...(options.optionalPicked !== undefined
          ? { optionalPicked: options.optionalPicked }
          : {}),
        ...(options.quantityEditable !== undefined
          ? { quantityEditable: options.quantityEditable }
          : {}),
        ...(options.quantityMin !== undefined ? { quantityMin: options.quantityMin } : {}),
        ...(options.quantityMax !== undefined ? { quantityMax: options.quantityMax } : {}),
        ...(options.comment !== undefined ? { comment: options.comment } : {}),
        ...(options.choiceGroup !== undefined ? { choiceGroup: options.choiceGroup } : {}),
      };

      // The customer chooses between alternatives, so each must be declinable
      // on its own; a required alternative is a contradiction.
      if (next.choiceGroup) next.optional = true;

      if (!next.quantityEditable) {
        next.quantityMin = null;
        next.quantityMax = null;
      }

      // An item nobody can deselect cannot be half-selected either.
      if (!next.optional) next.optionalPicked = false;

      return next;
    }),
  };
}

/**
 * Records an agent proposal **without changing the offer**.
 *
 * Nothing the customer would receive moves until the manager applies it on the
 * card (SPEC §7.2, `origin: "agent_suggestion"`). Suggesting twice replaces the
 * pending suggestion rather than stacking.
 */
export function suggestItemOptions(
  draft: WorkingDraft,
  itemId: string,
  suggestion: ItemSuggestion,
): WorkingDraft {
  return {
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId ? { ...item, suggested: suggestion } : item,
    ),
  };
}

/** The manager accepted a suggestion: copy it onto the item and clear it. */
export function applyItemSuggestion(draft: WorkingDraft, itemId: string): WorkingDraft {
  const item = draft.items.find((candidate) => candidate.id === itemId);
  if (!item?.suggested) return draft;

  // The rationale is explanatory text for the card, not a setting to copy.
  const options: ItemOptions = {
    role: item.suggested.role,
    optional: item.suggested.optional,
    quantityEditable: item.suggested.quantityEditable,
    quantityMin: item.suggested.quantityMin,
    quantityMax: item.suggested.quantityMax,
    comment: item.suggested.comment,
  };
  const applied = setItemOptions(draft, itemId, options);

  return {
    ...applied,
    items: applied.items.map((candidate) =>
      candidate.id === itemId ? { ...candidate, suggested: null } : candidate,
    ),
  };
}

/** The manager declined a suggestion: drop it, change nothing else. */
export function dismissItemSuggestion(draft: WorkingDraft, itemId: string): WorkingDraft {
  return {
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId ? { ...item, suggested: null } : item,
    ),
  };
}

/** Records a discount on an item. Policy validation lives in D15. */
export function setItemDiscount(
  draft: WorkingDraft,
  itemId: string,
  discount: Discount | null,
  policyOverride: DraftItem["policyOverride"] = null,
): WorkingDraft {
  return {
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId ? { ...item, discount, policyOverride } : item,
    ),
  };
}

/** Sets the draft's mode; "recovery" follows a rejection (D15). */
export function setMode(draft: WorkingDraft, mode: WorkingDraft["mode"]): WorkingDraft {
  return { ...draft, mode };
}

export function setRevisionNote(draft: WorkingDraft, revisionNote: string | null): WorkingDraft {
  return { ...draft, revisionNote };
}

/** Chooses the template this proposal is built from, or clears it. */
export function setTemplate(
  draft: WorkingDraft,
  template: WorkingDraft["template"],
): WorkingDraft {
  return { ...draft, template };
}
