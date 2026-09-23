import { eq } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import {
  addFlag,
  addItem,
  clearFlag,
  eventTypeSchema,
  headcountCertaintySchema,
  inferredFieldSchema,
  itemRoleSchema,
  parseDraft,
  removeEvent,
  removeItem,
  setBudget,
  setItemOptions,
  setRevisionNote,
  setRequirements,
  suggestItemOptions,
  upsertEvent,
  type WorkingDraft,
} from "@/lib/builder/draft";
import { calculateTotals } from "@/lib/builder/totals";
import { getContentLibrary } from "@/lib/content/library";
import { db } from "@/lib/db/client";
import { withDraftLock } from "./draft-lock";
import { inquiries } from "@/lib/db/schema";

/**
 * Tools for the inquiry assistant (SPEC §7.2).
 *
 * Every tool is scoped to the inquiry through this closure — the id is never a
 * tool argument, so the model cannot reach another inquiry's draft.
 *
 * There is deliberately **no tool that creates, patches or versions a
 * proposal**. That is the manager's button alone (SPEC §7.2, §6.4).
 */

type ToolError = { error: string };

/**
 * Where a draft is read from and written to.
 *
 * The chat route stores it on the inquiry row; the eval runner keeps it in
 * memory so fixtures never touch the database.
 */
export type DraftStore = {
  load: () => Promise<WorkingDraft>;
  save: (draft: WorkingDraft) => Promise<void>;
};

/** The database-backed store used by the chat route. */
export function inquiryDraftStore(inquiryId: string): DraftStore {
  return {
    async load() {
      const [inquiry] = await db
        .select({ workingDraft: inquiries.workingDraft, language: inquiries.language })
        .from(inquiries)
        .where(eq(inquiries.id, inquiryId))
        .limit(1);

      return parseDraft(inquiry?.workingDraft, inquiry?.language ?? "en");
    },
    async save(draft) {
      await db
        .update(inquiries)
        .set({ workingDraft: draft, updatedAt: new Date() })
        .where(eq(inquiries.id, inquiryId));
    },
  };
}

/** An in-memory store, for evals and tests. */
export function memoryDraftStore(initial: WorkingDraft): DraftStore {
  let draft = initial;

  return {
    load: async () => draft,
    save: async (next) => {
      draft = next;
    },
  };
}

/** The compact draft view every mutating tool returns to the model. */
type DraftSummary = {
  events: {
    id: string;
    type: string;
    label: string | undefined;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    headcount: number | null;
    inferred: string[];
    dateConfirmed: boolean;
  }[];
  items: {
    id: string;
    eventId: string;
    variationId: number;
    title: string;
    unit: string;
    quantity: number;
    quantitySource: string;
  }[];
  requirements: { id: string; text: string; status: string; itemId?: string }[];
  flags: { id: string; message: string }[];
  totalExclVatMinor: number;
  currency: string;
};

export function createAgentTools(
  inquiryId: string,
  store: DraftStore = inquiryDraftStore(inquiryId),
) {
  const loadDraft = store.load;

  async function saveDraft(draft: WorkingDraft) {
    await store.save(draft);

    return summarize(draft);
  }

  /**
   * Load, apply, save — as one unit. Concurrent tool calls in the same step
   * queue behind each other instead of overwriting one another's changes.
   */
  function mutate<T>(apply: (draft: WorkingDraft) => Promise<T> | T) {
    return withDraftLock(inquiryId, async () => {
      const draft = await loadDraft();
      return apply(draft);
    });
  }

  /** What every mutating tool returns: a compact view of the draft. */
  function summarize(draft: WorkingDraft): DraftSummary {
    const totals = calculateTotals(draft);

    return {
      events: draft.events.map((event) => ({
        id: event.id,
        type: event.type,
        label: event.label,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        headcount: event.headcount,
        inferred: event.inferred,
        dateConfirmed: event.dateConfirmed,
      })),
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
      flags: draft.flags.map((flag) => ({ id: flag.id, message: flag.message })),
      totalExclVatMinor: totals.exclVatMinor,
      currency: totals.currency,
    };
  }

  return {
    listContentLibrary: tool({
      description:
        "List the hotel's sellable products. Use this before suggesting anything — " +
        "only products returned here can be added to the draft.",
      inputSchema: z.object({
        type: z
          .enum(["accommodation", "meetingRoom", "food", "other"])
          .optional()
          .describe("Narrow to one category."),
      }),
      execute: async ({ type }) => {
        const products = await getContentLibrary();
        const filtered = type
          ? products.filter((product) => product.contentType === type)
          : products;

        return filtered.map((product) => ({
          productId: product.productId,
          variationId: product.variationId,
          title: product.title,
          description: product.description,
          unit: product.unit,
          type: product.contentType,
          // Both forms: the minor units are the source of truth, the
          // formatted string stops the model quoting "850" for 8.50 EUR.
          unitPriceMinor: product.unitPriceMinor,
          unitPrice: `${(product.unitPriceMinor / 100).toFixed(2)} ${product.currency}`,
          vatRate: product.vatRate,
          currency: product.currency,
        }));
      },
    }),

    getWorkingDraft: tool({
      description: "Read the current working draft for this inquiry.",
      inputSchema: z.object({}),
      execute: async () => summarize(await loadDraft()),
    }),

    upsertEvent: tool({
      description:
        "Add or update one event (a meeting, lunch, overnight stay…). Supply the id " +
        "of an existing event to update it. You cannot confirm a date — only the " +
        "manager can, using the checkbox on the card.",
      inputSchema: z.object({
        id: z.string().optional().describe("Omit to create a new event."),
        type: eventTypeSchema,
        label: z.string().optional().describe("Short human label, e.g. 'Company meeting'."),
        date: z.string().nullable().describe("YYYY-MM-DD, or null if unknown."),
        startTime: z.string().nullable().describe("HH:mm, or null if unknown."),
        endTime: z.string().nullable().describe("HH:mm, or null if unknown."),
        headcount: z.number().int().nullable().describe("Guests, or null if unknown."),
        inferred: z
          .array(inferredFieldSchema)
          .describe("Which values you inherited from another event rather than being told."),
        headcountCertainty: headcountCertaintySchema
          .optional()
          .describe("Use 'estimated' when the inquiry hedges, e.g. 'around 30' or '12, maybe 14'."),
        headcountMin: z.number().int().nullable().optional(),
        headcountMax: z.number().int().nullable().optional(),
      }),
      execute: async (input) =>
        mutate((draft) => {
          const id = input.id ?? `evt-${crypto.randomUUID().slice(0, 8)}`;

          return saveDraft(upsertEvent(draft, { ...input, id }));
        }),
    }),

    removeEvent: tool({
      description: "Remove an event and everything selected for it.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => mutate((draft) => saveDraft(removeEvent(draft, id))),
    }),

    addItem: tool({
      description:
        "Add a product from the content library to an event. The quantity is computed " +
        "from the product's unit and the event — never pass one.",
      inputSchema: z.object({
        eventId: z.string(),
        variationId: z.number().int().describe("From listContentLibrary."),
        note: z.string().optional().describe("Short note shown under the line."),
        role: itemRoleSchema
          .optional()
          .describe(
            "'core' is part of the offer; 'addon' is a value-added extra such as spa access, " +
              "a tour, late checkout or extra AV. Add-ons become optional and adjustable from zero.",
          ),
      }),
      execute: async ({ eventId, variationId, note, role }) => {
        const library = await getContentLibrary();

        return mutate<DraftSummary | ToolError>(async (draft) => {
          const product = library.find((candidate) => candidate.variationId === variationId);

          // Both failures are recoverable: tell the model how to fix it
          // rather than throwing, so it can correct itself in the next step.
          if (!product) {
            return {
              error:
                `No product with variationId ${variationId} exists in the content library. ` +
                `Call listContentLibrary and use a variationId from it.`,
            };
          }

          if (!draft.events.some((event) => event.id === eventId)) {
            return {
              error:
                `No event with id "${eventId}" is on the draft. ` +
                `Call getWorkingDraft for the current event ids, or create the event first.`,
            };
          }

          return saveDraft(
            addItem(draft, {
              id: `itm-${crypto.randomUUID().slice(0, 8)}`,
              eventId,
              product,
              note,
              role,
            }),
          );
        });
      },
    }),

    removeItem: tool({
      description: "Remove one selected product from the draft.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => mutate((draft) => saveDraft(removeItem(draft, id))),
    }),

    setItemOptions: tool({
      description:
        "Change how an item is presented: whether the customer may deselect it (optional), " +
        "whether they may change the quantity (flexible, with bounds), its role, or a note " +
        "shown beside it. This does NOT change the quantity itself — quantity follows the " +
        "event's headcount and times, so change those with upsertEvent instead. " +
        "Set `origin` honestly — it decides whether the change takes effect.",
      inputSchema: z.object({
        itemId: z.string(),
        origin: z
          .enum(["manager_request", "agent_suggestion"])
          .describe(
            "'manager_request' when the manager explicitly asked for this change — it is " +
              "applied immediately. 'agent_suggestion' when it is your own idea — it is shown " +
              "on the card for the manager to apply or dismiss, and changes nothing until they do.",
          ),
        rationale: z
          .string()
          .describe("One short sentence on why. Shown beside a suggestion on the card."),
        role: itemRoleSchema.optional(),
        optional: z.boolean().optional(),
        quantityEditable: z.boolean().optional(),
        quantityMin: z
          .number()
          .nullable()
          .optional()
          .describe("Lowest quantity the customer may choose."),
        quantityMax: z.number().nullable().optional(),
        comment: z.string().optional().describe("A note shown to the customer on this line."),
      }),
      execute: async ({ itemId, origin, rationale, ...options }) =>
        mutate<DraftSummary | ToolError>((draft) => {
          if (!draft.items.some((item) => item.id === itemId)) {
            return {
              error: `No item with id "${itemId}" is on the draft. Call getWorkingDraft for the current item ids.`,
            };
          }

          // Flexible with no bound is meaningless, and guessing a range on the
          // manager's behalf is exactly what rule 18 forbids.
          if (
            options.quantityEditable === true &&
            options.quantityMin == null &&
            options.quantityMax == null
          ) {
            return {
              error:
                "A flexible quantity needs a minimum, a maximum, or both. Ask the manager for " +
                "the range before calling this again.",
            };
          }

          return saveDraft(
            origin === "manager_request"
              ? setItemOptions(draft, itemId, options)
              : suggestItemOptions(draft, itemId, { ...options, rationale }),
          );
        }),
    }),

    setRequirements: tool({
      description:
        "Replace the requirement list — the things the customer asked for, each marked " +
        "matched (with the item that covers it) or unmatched.",
      inputSchema: z.object({
        requirements: z.array(
          z.object({
            text: z.string(),
            status: z.enum(["matched", "unmatched"]),
            itemId: z.string().optional().describe("The draft item that covers it."),
          }),
        ),
      }),
      execute: async ({ requirements }) =>
        mutate((draft) =>
          saveDraft(
            setRequirements(
              draft,
              requirements.map((requirement, index) => ({
                ...requirement,
                id: `req-${index}-${requirement.text.slice(0, 24).replace(/\s+/g, "-").toLowerCase()}`,
              })),
            ),
          ),
        ),
    }),

    addFlag: tool({
      description:
        "Raise a warning for the manager, e.g. that a room's capacity could not be " +
        "verified from its description.",
      inputSchema: z.object({
        severity: z.enum(["info", "warning"]),
        message: z.string(),
        eventId: z.string().optional(),
        itemId: z.string().optional(),
      }),
      execute: async (input) =>
        mutate((draft) =>
          saveDraft(addFlag(draft, { ...input, id: `flag-${crypto.randomUUID().slice(0, 8)}` })),
        ),
    }),

    clearFlag: tool({
      description: "Remove a warning that no longer applies.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => mutate((draft) => saveDraft(clearFlag(draft, id))),
    }),

    draftChangeNote: tool({
      description:
        "Draft the short \"What's changed\" note that travels with the next version and is " +
        "shown to the customer. Use it once you have made the edits for a revision. The " +
        "manager can edit it on the card before sending.",
      inputSchema: z.object({
        note: z
          .string()
          .describe("One or two plain sentences, e.g. 'Lunch increased to 60 guests and a dinner added.'"),
      }),
      execute: async ({ note }) => mutate((draft) => saveDraft(setRevisionNote(draft, note))),
    }),

    setBudget: tool({
      description: "Record a budget the customer mentioned. Never block on it.",
      inputSchema: z.object({
        amountMinor: z.number().int().describe("In minor units, e.g. 500000 for 5000.00."),
        currency: z.string(),
      }),
      execute: async (budget) => mutate((draft) => saveDraft(setBudget(draft, budget))),
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
