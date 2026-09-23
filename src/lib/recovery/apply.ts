import { and, desc, eq, isNull } from "drizzle-orm";

import { parseDraft, setItemDiscount, setMode } from "@/lib/builder/draft";
import { db } from "@/lib/db/client";
import { getActiveProposal } from "@/lib/db/queries";
import { inquiries, proposals, type RejectionCategory } from "@/lib/db/schema";
import { getContentLibrary } from "@/lib/content/library";
import { PRICING_POLICY } from "@/lib/pricing/policy";
import { validateDiscount } from "@/lib/pricing/validate";
import { applyRecoveryOption, buildRecoveryOptions, type RecoveryOption } from "./options";

export type RecoveryResult = { ok: true } | { ok: false; error: string; violations?: string[] };

/**
 * The recovery logic, kept apart from the server actions so scripts, evals and
 * tests can drive it without a request context for `revalidatePath`.
 */

/**
 * Records why a proposal was turned down (SPEC D15).
 *
 * Nothing about recovery happens until this exists — including the explicit
 * "they didn't say", which is a complete answer and unblocks the flow.
 */
export async function recordRejectionFor(
  inquiryId: string,
  reason: string,
  category: RejectionCategory,
): Promise<RecoveryResult> {
  const active = await getActiveProposal(inquiryId);
  if (!active) return { ok: false, error: "This inquiry has no active proposal." };

  await db
    .update(proposals)
    .set({ rejectionReason: reason, rejectionCategory: category })
    .where(eq(proposals.id, active.id));

  // The card switches to recovery mode so the manager sees the options.
  const [inquiry] = await db
    .select({ workingDraft: inquiries.workingDraft, language: inquiries.language })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (inquiry) {
    const draft = parseDraft(inquiry.workingDraft, inquiry.language);
    await db
      .update(inquiries)
      .set({ workingDraft: setMode(draft, "recovery"), updatedAt: new Date() })
      .where(eq(inquiries.id, inquiryId));
  }


  return { ok: true };
}

/** The recovery options for an inquiry, or none until a reason is recorded. */
export async function getRecoveryOptions(inquiryId: string): Promise<RecoveryOption[]> {
  const active = await getActiveProposal(inquiryId);
  if (!active?.rejectionCategory) return [];

  const [inquiry] = await db
    .select({ workingDraft: inquiries.workingDraft, language: inquiries.language })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (!inquiry) return [];

  const library = await getContentLibrary().catch(() => []);
  if (library.length === 0) return [];

  return buildRecoveryOptions({
    draft: parseDraft(inquiry.workingDraft, inquiry.language),
    library,
    policy: PRICING_POLICY,
    category: active.rejectionCategory,
  });
}

/** The manager accepting one option; it mutates the draft through D7 operations. */
export async function applyRecoveryFor(
  inquiryId: string,
  kind: RecoveryOption["kind"],
): Promise<RecoveryResult> {
  const options = await getRecoveryOptions(inquiryId);
  const option = options.find((candidate) => candidate.kind === kind);

  if (!option) return { ok: false, error: "That option is no longer available." };

  const [inquiry] = await db
    .select({ workingDraft: inquiries.workingDraft, language: inquiries.language })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  const library = await getContentLibrary().catch(() => []);
  const draft = parseDraft(inquiry.workingDraft, inquiry.language);
  const next = applyRecoveryOption(draft, option, library);

  // A discount option is still checked line by line: the preview was computed
  // from the same policy, but the draft may have moved since.
  for (const item of next.items) {
    if (!item.discount) continue;

    const validation = validateDiscount(item, item.discount, PRICING_POLICY);
    if (!validation.allowed) {
      return {
        ok: false,
        error: `That discount is outside policy for "${item.title}".`,
        violations: validation.violations.map((violation) => violation.message),
      };
    }
  }

  await db
    .update(inquiries)
    .set({ workingDraft: next, updatedAt: new Date() })
    .where(eq(inquiries.id, inquiryId));


  return { ok: true };
}

/**
 * The manager setting a discount by hand.
 *
 * Over-policy is refused outright unless they supply an override reason, which
 * is stored on the item and travels into the proposal snapshot.
 */
export async function applyManualDiscountFor(
  inquiryId: string,
  itemId: string,
  percent: number,
  overrideReason?: string,
): Promise<RecoveryResult> {
  const [inquiry] = await db
    .select({ workingDraft: inquiries.workingDraft, language: inquiries.language })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  const draft = parseDraft(inquiry.workingDraft, inquiry.language);
  const item = draft.items.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, error: "That item is no longer on the draft." };

  const discount = { type: "percent" as const, value: percent };
  const validation = validateDiscount(item, discount, PRICING_POLICY);

  if (!validation.allowed && !overrideReason) {
    return {
      ok: false,
      error: "That discount is outside policy. Add a reason to override it.",
      violations: validation.violations.map((violation) => violation.message),
    };
  }

  if (validation.missingComment) {
    return {
      ok: false,
      error: `Add a note to "${item.title}" explaining the reduction — the customer sees it.`,
    };
  }

  const next = setItemDiscount(
    draft,
    itemId,
    discount,
    validation.allowed ? null : { reason: overrideReason!, at: new Date().toISOString() },
  );

  await db
    .update(inquiries)
    .set({ workingDraft: next, updatedAt: new Date() })
    .where(eq(inquiries.id, inquiryId));


  return { ok: true };
}

/**
 * Whether a recovery worked: the status of the version created after the
 * rejected one (SPEC D15, outcome tracking).
 */
export async function recoveryOutcome(inquiryId: string): Promise<string | null> {
  const rejected = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.inquiryId, inquiryId), eq(proposals.status, "rejected")))
    .orderBy(desc(proposals.version))
    .limit(1);

  if (rejected.length === 0) return null;

  const [next] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(and(eq(proposals.inquiryId, inquiryId), isNull(proposals.supersededAt)))
    .limit(1);

  return next?.status ?? null;
}
