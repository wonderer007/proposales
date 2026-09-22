"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import {
  clearFlag,
  confirmDate,
  parseDraft,
  removeItem,
  setQuantity,
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

/**
 * Placeholder for the create/update/version action built in D11. It exists so
 * the button's wiring, pending state and error handling can be exercised now.
 */
export async function submitProposal(): Promise<BuilderResult> {
  return { ok: false, error: "Creating proposals arrives in D11." };
}
