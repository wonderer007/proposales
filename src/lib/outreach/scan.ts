import {
  listHistoryInquiries,
  listOutreachContacts,
  listUnclassifiedInquiries,
} from "@/lib/db/queries/outreach";
import { classifyPending } from "./classify";
import { findLeads } from "./leads";
import type { FindLeadsResult } from "./leads";

/**
 * One radar scan (D17).
 *
 * Classifies whatever the classifier has not seen yet, then runs the pure
 * detection over the whole history. Classification is bounded — see
 * `classifyPending` — so a large backlog is worked through over successive
 * scans rather than timing out the request.
 */

export type ScanInput = {
  /** ISO `YYYY-MM-DD`, from `getToday`. */
  today: string;
  from: string;
  to: string;
};

export type ScanResult = FindLeadsResult & {
  /** How many inquiries this scan classified, and how many are still waiting. */
  classified: number;
  classifyFailed: number;
  stillUnclassified: number;
};

export async function scanForLeads({ today, from, to }: ScanInput): Promise<ScanResult> {
  const pending = await listUnclassifiedInquiries();

  // A classifier outage must not empty the radar: already-classified customers
  // are still found, the rest are simply picked up on the next scan.
  const { classified, failed } = pending.length
    ? await classifyPending(pending)
    : { classified: 0, failed: 0 };

  const [inquiries, contacts] = await Promise.all([
    listHistoryInquiries(),
    listOutreachContacts(),
  ]);

  return {
    ...findLeads({ inquiries, contacts, today, from, to }),
    classified,
    classifyFailed: failed,
    stillUnclassified: pending.length - classified,
  };
}
