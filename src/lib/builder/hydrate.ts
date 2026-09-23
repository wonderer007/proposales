import type { WorkingDraft } from "./draft";

/**
 * Whether the working draft should be replaced by the active proposal's
 * snapshot (D14).
 *
 * After a version is created the conversation must continue from what the
 * customer actually received. Two cases need it:
 *   - the draft is empty, e.g. a manager returning to an old inquiry;
 *   - the draft has not been touched since the proposal was created, so it is
 *     the same content or staler.
 *
 * A draft edited *after* the proposal is the manager's work in progress and is
 * never overwritten.
 */
export function shouldHydrateFromSnapshot({
  draft,
  draftUpdatedAt,
  activeProposalCreatedAt,
}: {
  draft: WorkingDraft;
  draftUpdatedAt: Date;
  activeProposalCreatedAt: Date | null;
}): boolean {
  if (!activeProposalCreatedAt) return false;

  const isEmpty = draft.events.length === 0 && draft.items.length === 0;
  if (isEmpty) return true;

  return draftUpdatedAt.getTime() <= activeProposalCreatedAt.getTime();
}
