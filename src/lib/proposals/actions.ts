"use server";

import { revalidatePath } from "next/cache";

import { withDraftLock } from "@/lib/agent/draft-lock";
import { submitProposalToProposales, type SubmitResult } from "./submit";

export type { SubmitResult };

/**
 * The only path from a working draft to a proposal in Proposales.
 *
 * The agent has no tool that reaches this — it runs solely behind the
 * manager's button on the Proposal Builder card.
 */
export async function submitProposal(inquiryId: string): Promise<SubmitResult> {
  // Serialised per inquiry: a double click cannot run two submissions at once,
  // which is what would otherwise create two proposals.
  const result = await withDraftLock(`proposal:${inquiryId}`, () =>
    submitProposalToProposales(inquiryId),
  );

  if (result.ok) {
    revalidatePath(`/inquiries/${inquiryId}`);
    revalidatePath("/inquiries");
  }

  return result;
}
