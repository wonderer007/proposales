import { and, asc, countDistinct, desc, eq, isNull, or, sql } from "drizzle-orm";

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
  eventDate: string | null;
  /** Status of the active (non-superseded) proposal, or null if there is none. */
  activeProposalStatus: string | null;
  /** Which version is active, so the list can show "Draft v2". */
  activeProposalVersion: number | null;
  createdAt: Date;
};

/** How many inquiries a page shows. */
export const PAGE_SIZE = 10;

export type InquiryListPage = {
  rows: InquiryListRow[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Lists inquiries, newest first, optionally filtered by a case-insensitive
 * substring of the contact name or email, one page at a time.
 */
export async function listInquiries({
  q,
  page = 1,
}: { q?: string; page?: number } = {}): Promise<InquiryListPage> {
  const search = q?.trim();
  const pattern = search ? `%${search.toLowerCase()}%` : null;

  const where = pattern
    ? or(
        sql`lower(${inquiries.contactName}) like ${pattern}`,
        sql`lower(${inquiries.email}) like ${pattern}`,
      )
    : undefined;

  // Counted separately: the listing groups by inquiry, so a count over that
  // query would count groups per joined row instead of inquiries.
  const [counted] = await db
    .select({ total: countDistinct(inquiries.id) })
    .from(inquiries)
    .where(where);

  const total = counted?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);

  const rows = await db
    .select({
      id: inquiries.id,
      contactName: inquiries.contactName,
      email: inquiries.email,
      companyName: inquiries.companyName,
      createdAt: inquiries.createdAt,
      eventDate: sql<string | null>`min(${inquiryEvents.date})`,
      // At most one proposal survives the join (the partial unique index keeps
      // a single non-superseded row per inquiry), so max() is that row.
      activeProposalStatus: sql<string | null>`max(${proposals.status})`,
      activeProposalVersion: sql<number | null>`max(${proposals.version})`,
    })
    .from(inquiries)
    .leftJoin(inquiryEvents, eq(inquiryEvents.inquiryId, inquiries.id))
    .leftJoin(
      proposals,
      and(eq(proposals.inquiryId, inquiries.id), isNull(proposals.supersededAt)),
    )
    .where(where)
    .groupBy(inquiries.id)
    .orderBy(desc(inquiries.createdAt))
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE);

  return { rows, total, page: current, pageCount };
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
