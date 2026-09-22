import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";
import { getProposal } from "@/lib/proposales/client";

/** Don't re-check a proposal more than once a minute. */
const STALE_AFTER_MS = 60_000;

/**
 * Refreshes the mirrored status of an inquiry's active proposals from
 * Proposales.
 *
 * Superseded rows are left alone — their status is history. A failed lookup is
 * swallowed: the page must still render with the last known status.
 */
export async function refreshProposalStatuses(inquiryId: string): Promise<void> {
  const active = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.inquiryId, inquiryId), isNull(proposals.supersededAt)));

  const stale = active.filter(
    (proposal) =>
      !proposal.statusCheckedAt ||
      Date.now() - proposal.statusCheckedAt.getTime() > STALE_AFTER_MS,
  );

  await Promise.all(
    stale.map(async (proposal) => {
      try {
        const remote = await getProposal(proposal.proposalesUuid);

        await db
          .update(proposals)
          .set({ status: remote.status ?? proposal.status, statusCheckedAt: new Date() })
          .where(eq(proposals.id, proposal.id));
      } catch {
        // Proposales is unreachable or the proposal is gone; keep what we have.
      }
    }),
  );
}
