import { eq } from "drizzle-orm";

import type { ProposalTemplateRef } from "@/lib/builder/to-proposal";
import { db } from "@/lib/db/client";
import { proposalTemplates, type ProposalTemplate } from "@/lib/db/schema";
import { getSelectedCompanyId } from "@/lib/proposales/companies";

/**
 * Templates available in the current workspace, as mirrored by
 * `scripts/sync-templates.ts`. Read-only: nothing here creates a template.
 */
export async function getTemplates(): Promise<ProposalTemplate[]> {
  const companyId = await getSelectedCompanyId();

  return db
    .select()
    .from(proposalTemplates)
    .where(eq(proposalTemplates.companyId, companyId))
    .orderBy(proposalTemplates.title);
}

/** One template, only if it belongs to the current workspace. */
export async function getTemplate(uuid: string): Promise<ProposalTemplate | null> {
  const templates = await getTemplates();

  return templates.find((template) => template.uuid === uuid) ?? null;
}

/** What `toProposalRequest` needs to carry a template's presentation over. */
export function toTemplateRef(template: ProposalTemplate): ProposalTemplateRef {
  return {
    uuid: template.uuid,
    backgroundImageId: template.backgroundImageId,
    backgroundImageUuid: template.backgroundImageUuid,
    attachmentIds: template.attachmentIds,
  };
}
