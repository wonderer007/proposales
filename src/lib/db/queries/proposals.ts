import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";
import type { Proposal } from "@/lib/db/schema";

/** All proposal versions for an inquiry, newest version first. */
export async function getProposalsForInquiry(inquiryId: string): Promise<Proposal[]> {
  return db
    .select()
    .from(proposals)
    .where(eq(proposals.inquiryId, inquiryId))
    .orderBy(desc(proposals.version));
}

/**
 * The active proposal — the one version that has not been superseded — or null
 * when the inquiry has no proposal yet.
 */
export async function getActiveProposal(inquiryId: string): Promise<Proposal | null> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.inquiryId, inquiryId), isNull(proposals.supersededAt)))
    .limit(1);

  return proposal ?? null;
}
