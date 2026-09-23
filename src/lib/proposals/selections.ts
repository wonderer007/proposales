import type { WorkingDraft } from "@/lib/builder/draft";
import type { ProposalBlockState } from "@/lib/proposales/schemas";

/**
 * What the recipient changed on a sent proposal (SPEC §5, D14).
 *
 * Proposales reports the live state of each block. Comparing it with the
 * snapshot we sent tells us what the customer actually did: deselected an
 * optional line, or moved a flexible quantity.
 */

export type RecipientSelection = {
  variationId: number;
  title: string;
  /** Set only when the recipient deselected an optional line. */
  deselected?: boolean;
  /** Set only when the recipient moved the quantity. */
  quantityWas?: number;
  quantityNow?: number;
};

export type RecipientSelections = {
  checkedAt: string;
  changes: RecipientSelection[];
};

/**
 * Diffs the blocks Proposales reports against the snapshot we sent.
 *
 * `optional_picked` is absent until the recipient interacts, so an absent
 * value is treated as "no decision yet" rather than as a deselection.
 */
export function readRecipientSelections(
  snapshot: WorkingDraft,
  blocks: ProposalBlockState[] | undefined,
  checkedAt: Date,
): RecipientSelections {
  const changes: RecipientSelection[] = [];

  for (const block of blocks ?? []) {
    if (block.content_id == null) continue;

    const item = snapshot.items.find((candidate) => candidate.variationId === block.content_id);
    if (!item) continue;

    const change: RecipientSelection = { variationId: item.variationId, title: item.title };
    let changed = false;

    if (item.optional && block.optional_picked === false) {
      change.deselected = true;
      changed = true;
    }

    if (
      item.quantityEditable &&
      typeof block.quantity === "number" &&
      block.quantity !== item.quantity
    ) {
      change.quantityWas = item.quantity;
      change.quantityNow = block.quantity;
      changed = true;
    }

    if (changed) changes.push(change);
  }

  return { checkedAt: checkedAt.toISOString(), changes };
}

/** One line per change, for the card and the agent's context. */
export function describeSelections(selections: RecipientSelections | null): string[] {
  if (!selections) return [];

  return selections.changes.map((change) => {
    if (change.deselected) return `Customer deselected: ${change.title}`;

    return `Customer set ${change.title} to ${change.quantityNow} (was ${change.quantityWas})`;
  });
}
