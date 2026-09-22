import { desc, eq } from "drizzle-orm";

import { proposalAction } from "@/lib/builder/action-label";
import { diffDrafts } from "@/lib/builder/diff";
import { parseDraft } from "@/lib/builder/draft";
import { checkReadiness } from "@/lib/builder/readiness";
import { toProposalRequest } from "@/lib/builder/to-proposal";
import { getContentLibrary } from "@/lib/content/library";
import { db } from "@/lib/db/client";
import { getActiveProposal, getInquiryWithEvents } from "@/lib/db/queries";
import { proposals } from "@/lib/db/schema";
import {
  ProposalesError,
  createProposal,
  createProposalVersion,
  patchProposalDraft,
} from "@/lib/proposales/client";
import { configuredCompanyId } from "@/lib/proposales/company";

/**
 * Create, patch or version a proposal in Proposales (SPEC §6.4).
 *
 * Kept apart from the server action so it can be exercised directly by scripts
 * and evals, which have no request context for `revalidatePath`.
 */

export type SubmitResult =
  | { ok: true; action: "create" | "patch" | "version"; version: number; url: string }
  | { ok: false; error: string; reasons?: string[] };

function errorMessage(error: unknown): string {
  if (error instanceof ProposalesError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export async function submitProposalToProposales(inquiryId: string): Promise<SubmitResult> {
  const inquiry = await getInquiryWithEvents(inquiryId);
  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  const draft = parseDraft(inquiry.workingDraft, inquiry.language);

  // Re-check against a fresh library: a product may have been archived since
  // the page rendered, and the button's disabled state is only a hint.
  const library = await getContentLibrary({ force: true }).catch(() => null);
  if (!library) {
    return { ok: false, error: "Could not reach the Proposales content library. Try again." };
  }

  const readiness = checkReadiness(draft, {
    knownVariationIds: new Set(library.map((product) => product.variationId)),
    today: new Date().toISOString().slice(0, 10),
  });

  if (!readiness.ready) {
    return {
      ok: false,
      error: "The draft is not ready yet.",
      reasons: readiness.reasons,
    };
  }

  const active = await getActiveProposal(inquiryId);
  const action = proposalAction(active?.status);

  if (active && action !== "create") {
    const changes = diffDrafts(parseDraft(active.snapshot, draft.language), draft);

    if (changes.length === 0) {
      return {
        ok: false,
        error: `Nothing has changed since version ${active.version}.`,
      };
    }
  }

  const body = toProposalRequest(
    {
      id: inquiry.id,
      contactName: inquiry.contactName,
      email: inquiry.email,
      phone: inquiry.phone,
      companyName: inquiry.companyName,
      rfpId: inquiry.rfpId,
    },
    draft,
    { companyId: configuredCompanyId() },
  );

  try {
    if (action === "patch" && active) {
      // Lineage belongs to the original creation, and PATCH rejects it.
      const patchBody = { ...body };
      delete patchBody.tracking;
      await patchProposalDraft(active.proposalesUuid, patchBody);

      await db
        .update(proposals)
        .set({ snapshot: draft, statusCheckedAt: new Date() })
        .where(eq(proposals.id, active.id));

      return { ok: true, action, version: active.version, url: active.proposalesUrl };
    }

    if (action === "version" && active) {
      const created = await createProposalVersion(active.proposalesUuid, body);

      // The API returns the same draft until it is sent, so a repeat call can
      // hand back a uuid we already store. Update that row instead of
      // inserting a duplicate.
      const [existing] = await db
        .select()
        .from(proposals)
        .where(eq(proposals.proposalesUuid, created.uuid))
        .limit(1);

      if (existing) {
        await db
          .update(proposals)
          .set({ snapshot: draft, statusCheckedAt: new Date() })
          .where(eq(proposals.id, existing.id));


        return { ok: true, action, version: existing.version, url: existing.proposalesUrl };
      }

      const version = (await nextVersion(inquiryId)) ?? active.version + 1;

      // One atomic request: the previous version is superseded and the new one
      // inserted together, so the partial unique index can never see two
      // active rows (`db.transaction` is unsupported on the HTTP driver).
      await db.batch([
        db
          .update(proposals)
          .set({ supersededAt: new Date() })
          .where(eq(proposals.id, active.id)),
        db.insert(proposals).values({
          inquiryId,
          proposalesUuid: created.uuid,
          proposalesUrl: created.url,
          version,
          status: "draft",
          snapshot: draft,
          statusCheckedAt: new Date(),
        }),
      ]);

      return { ok: true, action, version, url: created.url };
    }

    const created = await createProposal(body);
    const version = (await nextVersion(inquiryId)) ?? 1;

    await db.insert(proposals).values({
      inquiryId,
      proposalesUuid: created.uuid,
      proposalesUrl: created.url,
      version,
      status: "draft",
      snapshot: draft,
      statusCheckedAt: new Date(),
    });

    return { ok: true, action: "create", version, url: created.url };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** One past the highest version this inquiry has ever had. */
async function nextVersion(inquiryId: string): Promise<number | null> {
  const [latest] = await db
    .select({ version: proposals.version })
    .from(proposals)
    .where(eq(proposals.inquiryId, inquiryId))
    .orderBy(desc(proposals.version))
    .limit(1);

  return latest ? latest.version + 1 : 1;
}
