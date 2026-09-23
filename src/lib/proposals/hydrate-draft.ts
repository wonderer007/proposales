import { eq } from "drizzle-orm";

import { parseDraft, type WorkingDraft } from "@/lib/builder/draft";
import { shouldHydrateFromSnapshot } from "@/lib/builder/hydrate";
import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import type { Inquiry, Proposal } from "@/lib/db/schema";

/**
 * Makes sure the working draft reflects what the customer actually received.
 *
 * Called when the inquiry page loads: if the draft is empty or untouched since
 * the active proposal, it is replaced by that proposal's snapshot so the
 * conversation and the card continue from the sent version (D14).
 */
export async function hydrateDraft(
  inquiry: Pick<Inquiry, "id" | "language" | "workingDraft" | "updatedAt">,
  activeProposal: Pick<Proposal, "snapshot" | "createdAt"> | null,
): Promise<WorkingDraft> {
  const draft = parseDraft(inquiry.workingDraft, inquiry.language);

  const hydrate = shouldHydrateFromSnapshot({
    draft,
    draftUpdatedAt: inquiry.updatedAt,
    activeProposalCreatedAt: activeProposal?.createdAt ?? null,
  });

  if (!hydrate || !activeProposal) return draft;

  const snapshot = parseDraft(activeProposal.snapshot, inquiry.language);

  // Nothing to copy: leave the draft as it is rather than blanking it.
  if (snapshot.events.length === 0 && snapshot.items.length === 0) return draft;

  await db
    .update(inquiries)
    // Deliberately not touching updatedAt: this is a restore, not an edit, and
    // bumping it would make the draft look newer than the proposal forever.
    .set({ workingDraft: snapshot })
    .where(eq(inquiries.id, inquiry.id));

  return snapshot;
}
