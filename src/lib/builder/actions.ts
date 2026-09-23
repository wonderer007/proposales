"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import {
  applyItemSuggestion,
  clearFlag,
  confirmDate,
  dismissItemSuggestion,
  parseDraft,
  removeItem,
  setItemOptions,
  setQuantity,
  setRevisionNote,
  type ItemOptions,
  type WorkingDraft,
} from "./draft";

/**
 * The manager's edits to the working draft.
 *
 * Each action reloads the stored draft, applies one pure operation from
 * `draft.ts`, and writes the result back. Nothing here creates, patches or
 * versions a proposal — that is D11's single server action, behind the button.
 */

export type BuilderResult = { ok: true } | { ok: false; error: string };

async function updateDraft(
  inquiryId: string,
  apply: (draft: WorkingDraft) => WorkingDraft,
): Promise<BuilderResult> {
  const [inquiry] = await db
    .select({ workingDraft: inquiries.workingDraft, language: inquiries.language })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (!inquiry) return { ok: false, error: "Inquiry not found" };

  const draft = parseDraft(inquiry.workingDraft, inquiry.language);

  await db
    .update(inquiries)
    .set({ workingDraft: apply(draft), updatedAt: new Date() })
    .where(eq(inquiries.id, inquiryId));

  revalidatePath(`/inquiries/${inquiryId}`);

  return { ok: true };
}

/** The date checkbox — the one thing only the manager may set. */
export async function confirmEventDate(
  inquiryId: string,
  eventId: string,
  confirmed: boolean,
): Promise<BuilderResult> {
  return updateDraft(inquiryId, (draft) => confirmDate(draft, eventId, confirmed));
}

/** Overriding a quantity by hand; the line stops being recomputed. */
export async function updateItemQuantity(
  inquiryId: string,
  itemId: string,
  quantity: number,
): Promise<BuilderResult> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: "Quantity must be zero or more" };
  }

  return updateDraft(inquiryId, (draft) => setQuantity(draft, itemId, quantity));
}

export async function removeDraftItem(
  inquiryId: string,
  itemId: string,
): Promise<BuilderResult> {
  return updateDraft(inquiryId, (draft) => removeItem(draft, itemId));
}

export async function dismissFlag(inquiryId: string, flagId: string): Promise<BuilderResult> {
  return updateDraft(inquiryId, (draft) => clearFlag(draft, flagId));
}

/** The "What's changed" note that travels with the next version. */
export async function updateVersionNote(
  inquiryId: string,
  note: string | null,
): Promise<BuilderResult> {
  return updateDraft(inquiryId, (draft) => setRevisionNote(draft, note));
}

/** The manager changing an item's presentation settings on the card. */
export async function updateItemOptions(
  inquiryId: string,
  itemId: string,
  options: ItemOptions,
): Promise<BuilderResult> {
  const { quantityMin, quantityMax } = options;

  if (quantityMin != null && quantityMin < 0) {
    return { ok: false, error: "The minimum cannot be negative" };
  }
  if (quantityMin != null && quantityMax != null && quantityMin > quantityMax) {
    return { ok: false, error: "The minimum cannot be above the maximum" };
  }

  return updateDraft(inquiryId, (draft) => setItemOptions(draft, itemId, options));
}

/** Accepting what the agent proposed: only now does the offer change. */
export async function acceptItemSuggestion(
  inquiryId: string,
  itemId: string,
): Promise<BuilderResult> {
  return updateDraft(inquiryId, (draft) => applyItemSuggestion(draft, itemId));
}

/** Declining a suggestion. The offer is untouched either way. */
export async function rejectItemSuggestion(
  inquiryId: string,
  itemId: string,
): Promise<BuilderResult> {
  return updateDraft(inquiryId, (draft) => dismissItemSuggestion(draft, itemId));
}
