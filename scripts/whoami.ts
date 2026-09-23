/**
 * Prints the companies the Proposales API key can access, with each one's id
 * and public inbox token.
 *
 * The app reads this list itself and lets the manager switch between them, so
 * no company id needs configuring; the ids are useful for scripts, which take
 * `--company <id>`.
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
    console.log(`    id                    = ${company.id}`);
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
