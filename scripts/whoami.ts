/**
 * Prints the companies the Proposales API key can access, so you can pick
 * PROPOSALES_COMPANY_ID and see each company's public inbox token.
 *
 *   bun run scripts/whoami.ts
 */
import { ProposalesError, listCompanies } from "@/lib/proposales/client";

try {
  const companies = await listCompanies();

  if (companies.length === 0) {
    console.log("This API key is not a member of any company.");
    process.exit(0);
  }

  console.log(`${companies.length} compan${companies.length === 1 ? "y" : "ies"}:\n`);

  for (const company of companies) {
    console.log(`  ${company.name}`);
    console.log(`    PROPOSALES_COMPANY_ID = ${company.id}`);
    console.log(`    currency              = ${company.currency}`);
    console.log(`    timezone              = ${company.timezone}`);
    console.log(
      `    inbox_token           = ${company.inbox_token ?? "(none — RFP creation unavailable)"}`,
    );
    console.log();
  }
} catch (error) {
  if (error instanceof ProposalesError) {
    console.error(`Proposales request failed (${error.method} ${error.path}): ${error.message}`);
    for (const issue of error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  throw error;
}
