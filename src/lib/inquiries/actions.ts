"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { getInquiryWithEvents } from "@/lib/db/queries";
import { inquiries, inquiryEvents } from "@/lib/db/schema";
import { ProposalesError, createRfp } from "@/lib/proposales/client";
import { getInboxToken } from "@/lib/proposales/company";
import { toRfpRequest } from "./rfp";
import { detectLanguage, newInquirySchema, type NewInquiryInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof ProposalesError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Mirrors an inquiry into Proposales as an RFP and records the outcome.
 *
 * A failure is stored on the inquiry rather than thrown: the inquiry itself is
 * already saved, and the detail page offers a retry. Safe to call again — a
 * successful sync overwrites any previous error.
 */
export async function syncRfp(inquiryId: string): Promise<ActionResult> {
  const inquiry = await getInquiryWithEvents(inquiryId);

  if (!inquiry) return { ok: false, error: "Inquiry not found" };

  try {
    const inboxToken = await getInboxToken();
    const { id } = await createRfp(inboxToken, toRfpRequest(inquiry, inquiry.events));

    await db
      .update(inquiries)
      .set({ rfpId: id, rfpSyncError: null, updatedAt: new Date() })
      .where(eq(inquiries.id, inquiryId));

    revalidatePath(`/inquiries/${inquiryId}`);
    revalidatePath("/");

    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);

    await db
      .update(inquiries)
      .set({ rfpSyncError: message, updatedAt: new Date() })
      .where(eq(inquiries.id, inquiryId));

    revalidatePath(`/inquiries/${inquiryId}`);

    return { ok: false, error: message };
  }
}

export type CreateInquiryResult = { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Validates and stores a new inquiry, mirrors it to Proposales, then redirects
 * to its detail page. Only returns on failure; success ends in a redirect.
 */
export async function createInquiry(input: NewInquiryInput): Promise<CreateInquiryResult> {
  const parsed = newInquirySchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }

    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;
  let inquiryId: string;

  try {
    const [created] = await db
      .insert(inquiries)
      .values({
        contactName: data.contactName,
        email: data.email,
        phone: data.phone || null,
        companyName: data.companyName || null,
        message: data.message,
        // Not asked on the form; inferred from the message and editable later.
        language: detectLanguage(data.message),
      })
      .returning({ id: inquiries.id });

    if (!created) return { ok: false, error: "Could not save the inquiry." };

    inquiryId = created.id;

    await db.insert(inquiryEvents).values({
      inquiryId: created.id,
      date: data.range.startDate,
      endDate: data.range.endDate === data.range.startDate ? null : data.range.endDate,
      startTime: data.range.startTime,
      endTime: data.range.endTime,
      position: 0,
    });
  } catch (error) {
    return { ok: false, error: `Could not save the inquiry: ${errorMessage(error)}` };
  }

  // The inquiry is saved either way; a failed sync is stored and retried later.
  await syncRfp(inquiryId);

  revalidatePath("/");
  redirect(`/inquiries/${inquiryId}`);
}
