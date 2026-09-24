"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { customerKeyForInquiry, recordOutreach } from "@/lib/db/queries/outreach";
import { isOutreachEnabled } from "@/lib/flags";
import { acceptSuggestedCadence } from "./classify";
import { getLeadDetail } from "./lead-detail";
import { draftMessageForLead } from "./message";
import { isIsoDate } from "./today";

/**
 * The manager's actions on an outreach lead (D17).
 *
 * Nothing here sends anything: "Mark as contacted" records that the manager
 * reached out themselves, so the lead stops being suggested. There is no email
 * integration, by design.
 *
 * Each action re-checks the feature flag. A server action is a POST endpoint
 * that stays reachable whether or not anything renders a button for it, so
 * hiding the screens would not be enough on its own.
 */

const DISABLED = { ok: false, error: "Outreach is not enabled." } as const;

export type OutreachResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const rangeSchema = z.object({
  inquiryId: z.uuid(),
  today: z.string().refine(isIsoDate, "Not a date"),
  from: z.string().refine(isIsoDate, "Not a date"),
  to: z.string().refine(isIsoDate, "Not a date"),
});

/** Re-drafts the message for a lead. */
export async function regenerateMessage(input: {
  inquiryId: string;
  today: string;
  from: string;
  to: string;
}): Promise<OutreachResult<string>> {
  if (!isOutreachEnabled()) return DISABLED;

  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad request." };

  const detail = await getLeadDetail(parsed.data.inquiryId, parsed.data);
  if (!detail?.lead) return { ok: false, error: "This customer is not a lead right now." };

  try {
    return { ok: true, data: await draftMessageForLead(detail.lead) };
  } catch {
    return { ok: false, error: "Could not draft a message. Try again." };
  }
}

const contactedSchema = rangeSchema.extend({
  message: z.string().trim().min(1, "Write a message first.").max(5_000),
});

/**
 * Records that the manager reached out, which hides the lead for 90 days.
 *
 * The message is stored as sent, so the next cycle can see what was said.
 */
export async function markAsContacted(input: {
  inquiryId: string;
  today: string;
  from: string;
  to: string;
  message: string;
}): Promise<OutreachResult> {
  if (!isOutreachEnabled()) return DISABLED;

  const parsed = contactedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad request." };
  }

  const { inquiryId, message } = parsed.data;

  const detail = await getLeadDetail(inquiryId, parsed.data);
  if (!detail) return { ok: false, error: "Customer not found." };

  // The expected date keys the log, so it has to come from the same maths the
  // lead was found with — never from the client.
  const nextExpectedDate = detail.lead?.nextExpectedDate;
  if (!nextExpectedDate) {
    return { ok: false, error: "This customer is not a lead right now." };
  }

  const key = await customerKeyForInquiry(inquiryId);
  if (!key) return { ok: false, error: "Customer not found." };

  await recordOutreach({
    customerKeyValue: key,
    sourceInquiryId: inquiryId,
    nextExpectedDate,
    message,
  });

  revalidatePath("/outreach");
  revalidatePath(`/outreach/${inquiryId}`);

  return { ok: true };
}

const acceptSchema = z.object({
  inquiryId: z.uuid(),
  cadence: z.enum(["annual", "quarterly", "monthly", "one_off", "unknown"]),
});

/**
 * Accepts the classifier's suggestion for an inquiry it was not sure about.
 *
 * This is the only cadence edit the manager has: they confirm what the
 * classifier guessed, they do not pick a cadence of their own.
 */
export async function acceptCadence(input: {
  inquiryId: string;
  cadence: string;
}): Promise<OutreachResult> {
  if (!isOutreachEnabled()) return DISABLED;

  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad request." };

  await acceptSuggestedCadence(parsed.data.inquiryId, parsed.data.cadence);

  revalidatePath("/outreach");
  revalidatePath(`/outreach/${parsed.data.inquiryId}`);

  return { ok: true };
}
