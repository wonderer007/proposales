import { asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { parseDraft } from "@/lib/builder/draft";
import type { EventType } from "@/lib/builder/draft";
import { calculateTotals } from "@/lib/builder/totals";
import { db } from "@/lib/db/client";
import { inquiries, inquiryEvents, outreachLog, proposals } from "@/lib/db/schema";
import { deriveInquiryStatus } from "@/lib/inquiry-status";
import { customerKey } from "@/lib/outreach/leads";
import type { HistoryEvent, HistoryInquiry, OutreachContact } from "@/lib/outreach/types";

/**
 * Reads the whole inquiry history in the shape the outreach radar needs (D17).
 *
 * Everything the radar decides with is loaded here, so `findLeads` stays pure.
 * The volume is small by design — this is a per-hotel inbox, not a CRM — so it
 * reads all of it rather than paginating, and does the grouping in memory.
 */

/**
 * Event types live on the working draft, not on `inquiry_events`: the form only
 * captures dates and times, and the type is something the agent works out. An
 * inquiry the agent never touched simply has no types.
 */
function eventTypesFromDraft(workingDraft: unknown): (EventType | null)[] {
  if (!workingDraft) return [];
  try {
    return parseDraft(workingDraft).events.map((event) => event.type);
  } catch {
    return [];
  }
}

/** The committed total excluding VAT, from the snapshot the version was built from. */
function proposalValue(snapshot: unknown): { valueMinor: number; currency: string } {
  try {
    const totals = calculateTotals(parseDraft(snapshot));
    return { valueMinor: totals.exclVatMinor, currency: totals.currency };
  } catch {
    return { valueMinor: 0, currency: "EUR" };
  }
}

export async function listHistoryInquiries(): Promise<HistoryInquiry[]> {
  const rows = await db.select().from(inquiries).orderBy(desc(inquiries.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [events, proposalRows] = await Promise.all([
    db
      .select()
      .from(inquiryEvents)
      .where(inArray(inquiryEvents.inquiryId, ids))
      .orderBy(asc(inquiryEvents.date), asc(inquiryEvents.position)),
    db
      .select()
      .from(proposals)
      .where(inArray(proposals.inquiryId, ids))
      .orderBy(asc(proposals.version)),
  ]);

  const eventsByInquiry = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByInquiry.get(event.inquiryId);
    if (list) list.push(event);
    else eventsByInquiry.set(event.inquiryId, [event]);
  }

  const proposalsByInquiry = new Map<string, typeof proposalRows>();
  for (const proposal of proposalRows) {
    const list = proposalsByInquiry.get(proposal.inquiryId);
    if (list) list.push(proposal);
    else proposalsByInquiry.set(proposal.inquiryId, [proposal]);
  }

  return rows.map((row) => {
    const rowEvents = eventsByInquiry.get(row.id) ?? [];
    const types = eventTypesFromDraft(row.workingDraft);
    const rowProposals = proposalsByInquiry.get(row.id) ?? [];

    // Events and draft events are both in inquiry order, so the nth event's
    // type is the nth draft event's. A draft with a different number of events
    // just leaves the extras untyped.
    const historyEvents: HistoryEvent[] = rowEvents.map((event, index) => ({
      date: event.date,
      endDate: event.endDate,
      type: types[index] ?? null,
    }));

    const active = rowProposals.find((proposal) => proposal.supersededAt === null);

    return {
      id: row.id,
      contactName: row.contactName,
      email: row.email,
      companyName: row.companyName,
      phone: row.phone,
      language: row.language,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      cadence: row.cadence,
      cadenceConfidence: row.cadenceConfidence,
      cadenceEvidence: row.cadenceEvidence,
      cadenceSource: row.cadenceSource,
      events: historyEvents,
      proposals: rowProposals.map((proposal) => ({
        version: proposal.version,
        status: proposal.status,
        ...proposalValue(proposal.snapshot),
        rejectionReason: proposal.rejectionReason,
        createdAt: proposal.createdAt.toISOString(),
      })),
      status: deriveInquiryStatus(active?.status),
    } satisfies HistoryInquiry;
  });
}

/** Every outreach already recorded, for the 90-day cooldown. */
export async function listOutreachContacts(): Promise<OutreachContact[]> {
  const rows = await db.select().from(outreachLog).orderBy(desc(outreachLog.createdAt));

  return rows.map((row) => ({
    customerKey: row.customerKey,
    nextExpectedDate: row.nextExpectedDate,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Inquiries the cadence classifier has not seen yet, oldest inquiry last. */
export async function listUnclassifiedInquiries() {
  const rows = await db
    .select({
      id: inquiries.id,
      message: inquiries.message,
      workingDraft: inquiries.workingDraft,
    })
    .from(inquiries)
    .where(isNull(inquiries.cadence))
    .orderBy(desc(inquiries.createdAt));

  if (rows.length === 0) return [];

  const dates = await db
    .select({ inquiryId: inquiryEvents.inquiryId, date: inquiryEvents.date })
    .from(inquiryEvents)
    .where(
      inArray(
        inquiryEvents.inquiryId,
        rows.map((row) => row.id),
      ),
    );

  const datesByInquiry = new Map<string, string[]>();
  for (const { inquiryId, date } of dates) {
    const list = datesByInquiry.get(inquiryId);
    if (list) list.push(date);
    else datesByInquiry.set(inquiryId, [date]);
  }

  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    eventTypes: eventTypesFromDraft(row.workingDraft).filter(
      (type): type is EventType => type !== null,
    ),
    eventDates: datesByInquiry.get(row.id) ?? [],
  }));
}

/** Records that the manager reached out about one lead. */
export async function recordOutreach({
  customerKeyValue,
  sourceInquiryId,
  nextExpectedDate,
  message,
}: {
  customerKeyValue: string;
  sourceInquiryId: string;
  nextExpectedDate: string;
  message: string;
}): Promise<void> {
  await db
    .insert(outreachLog)
    .values({
      customerKey: customerKeyValue,
      sourceInquiryId,
      nextExpectedDate,
      action: "contacted",
      message,
    })
    // Marking the same lead twice is the manager clicking twice, not an error.
    .onConflictDoNothing();
}

/** The key the log is written under, for one inquiry. */
export async function customerKeyForInquiry(inquiryId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: inquiries.email, companyName: inquiries.companyName })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  return row ? customerKey(row.email, row.companyName) : null;
}
