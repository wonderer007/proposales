import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { inquiries, inquiryEvents, proposals } from "@/lib/db/schema";
import type { Inquiry, InquiryEvent } from "@/lib/db/schema";

/** One row of the inquiry list (SPEC §4.1). Status is derived in the UI. */
export type InquiryListRow = {
  id: string;
  contactName: string;
  email: string;
  companyName: string | null;
  /** Earliest event date on the inquiry, `YYYY-MM-DD`, or null if it has none. */
  firstEventDate: string | null;
  /** Status of the active (non-superseded) proposal, or null if there is none. */
  activeProposalStatus: string | null;
  createdAt: Date;
};

/**
 * Lists inquiries, newest first, optionally filtered by a case-insensitive
 * substring of the contact name or email.
 */
export async function listInquiries({ q }: { q?: string } = {}): Promise<InquiryListRow[]> {
  const search = q?.trim();
  const pattern = search ? `%${search.toLowerCase()}%` : null;

  return db
    .select({
      id: inquiries.id,
      contactName: inquiries.contactName,
      email: inquiries.email,
      companyName: inquiries.companyName,
      createdAt: inquiries.createdAt,
      firstEventDate: sql<string | null>`min(${inquiryEvents.date})`,
      // At most one proposal survives the join (the partial unique index keeps
      // a single non-superseded row per inquiry), so max() is that row.
      activeProposalStatus: sql<string | null>`max(${proposals.status})`,
    })
    .from(inquiries)
    .leftJoin(inquiryEvents, eq(inquiryEvents.inquiryId, inquiries.id))
    .leftJoin(
      proposals,
      and(eq(proposals.inquiryId, inquiries.id), isNull(proposals.supersededAt)),
    )
    .where(
      pattern
        ? or(
            sql`lower(${inquiries.contactName}) like ${pattern}`,
            sql`lower(${inquiries.email}) like ${pattern}`,
          )
        : undefined,
    )
    .groupBy(inquiries.id)
    .orderBy(desc(inquiries.createdAt));
}

export type InquiryWithEvents = Inquiry & { events: InquiryEvent[] };

/** Loads one inquiry with its form events, or null when the id is unknown. */
export async function getInquiryWithEvents(id: string): Promise<InquiryWithEvents | null> {
  const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);

  if (!inquiry) return null;

  const events = await db
    .select()
    .from(inquiryEvents)
    .where(eq(inquiryEvents.inquiryId, id))
    .orderBy(asc(inquiryEvents.position));

  return { ...inquiry, events };
}
