/**
 * Mirrors the company's proposal templates into `proposal_templates`.
 *
 *   bun run templates:sync
 *   bun run templates:sync --company 5473
 *
 * Run it regularly, and whenever templates change in Proposales. Templates are
 * only ever read: this script never creates or edits one.
 *
 * Each template is itself a proposal, so its background image and attachments
 * are fetched individually — that is what a proposal built from it inherits.
 */
import { and, eq, notInArray } from "drizzle-orm";

import { loadEnv } from "@/env.schema";
import { db } from "@/lib/db/client";
import { proposalTemplates } from "@/lib/db/schema";
import { ProposalesError, getProposal, listCompanies, listCompanyTemplates } from "@/lib/proposales/client";

async function main() {
  const flagIndex = process.argv.indexOf("--company");
  const flagValue = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
  const { PROPOSALES_COMPANY_ID } = loadEnv();
  const wanted = Number(flagValue ?? PROPOSALES_COMPANY_ID);

  const companies = await listCompanies();
  if (companies.length === 0) throw new Error("This API key cannot reach any company.");

  const company = Number.isInteger(wanted)
    ? companies.find((candidate) => candidate.id === wanted)
    : companies[0];

  if (!company) {
    throw new Error(
      `No access to company ${wanted}. Available: ${companies.map((c) => `${c.id} (${c.name})`).join(", ")}.`,
    );
  }

  const templates = await listCompanyTemplates(company.id);
  console.log(`${templates.length} template(s) in "${company.name}" (${company.id}).\n`);

  const seen: string[] = [];

  for (const template of templates) {
    // The list gives a title and uuid; the background and attachments live on
    // the template proposal itself.
    const detail = await getProposal(template.uuid).catch(() => null);

    const row = {
      uuid: template.uuid,
      companyId: company.id,
      title: template.title.trim(),
      language: template.language,
      backgroundImageId: detail?.background_image?.id ?? null,
      backgroundImageUuid: detail?.background_image?.uuid ?? template.background_image_uuid ?? null,
      attachmentIds: detail?.attachments?.map((attachment) => attachment.id) ?? [],
      syncedAt: new Date(),
    };

    await db
      .insert(proposalTemplates)
      .values(row)
      .onConflictDoUpdate({ target: proposalTemplates.uuid, set: row });

    seen.push(template.uuid);
    console.log(
      `  ${row.title.padEnd(28)} ${row.backgroundImageUuid ? "background" : "no background"}, ` +
        `${row.attachmentIds.length} attachment(s)`,
    );
  }

  // Templates removed in Proposales should stop being offered here.
  const removed = await db
    .delete(proposalTemplates)
    .where(
      seen.length > 0
        ? and(eq(proposalTemplates.companyId, company.id), notInArray(proposalTemplates.uuid, seen))
        : eq(proposalTemplates.companyId, company.id),
    )
    .returning({ title: proposalTemplates.title });

  if (removed.length > 0) {
    console.log(`\nRemoved ${removed.length} no longer in Proposales: ${removed.map((r) => r.title).join(", ")}`);
  }

  console.log(`\nDone. ${templates.length} synced.`);
}

try {
  await main();
} catch (error) {
  if (error instanceof ProposalesError) {
    console.error(`Proposales request failed (${error.method} ${error.path}): ${error.message}`);
    process.exit(1);
  }
  throw error;
}
