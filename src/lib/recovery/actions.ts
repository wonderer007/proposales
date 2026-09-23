"use server";

import { revalidatePath } from "next/cache";

import type { RejectionCategory } from "@/lib/db/schema";
import {
  applyManualDiscountFor,
  applyRecoveryFor,
  recordRejectionFor,
  type RecoveryResult,
} from "./apply";
import type { RecoveryOption } from "./options";

export type { RecoveryResult };

// Read-only helpers are NOT re-exported here: a "use server" module may only
// export async server actions, and a re-export breaks the transform. Import
// them straight from "./apply" instead.

function revalidate(inquiryId: string) {
  revalidatePath(`/inquiries/${inquiryId}`);
}

export async function recordRejection(
  inquiryId: string,
  reason: string,
  category: RejectionCategory,
): Promise<RecoveryResult> {
  const result = await recordRejectionFor(inquiryId, reason, category);
  if (result.ok) revalidate(inquiryId);

  return result;
}

export async function applyRecovery(
  inquiryId: string,
  kind: RecoveryOption["kind"],
): Promise<RecoveryResult> {
  const result = await applyRecoveryFor(inquiryId, kind);
  if (result.ok) revalidate(inquiryId);

  return result;
}

export async function applyManualDiscount(
  inquiryId: string,
  itemId: string,
  percent: number,
  overrideReason?: string,
): Promise<RecoveryResult> {
  const result = await applyManualDiscountFor(inquiryId, itemId, percent, overrideReason);
  if (result.ok) revalidate(inquiryId);

  return result;
}
