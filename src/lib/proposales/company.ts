import { loadEnv } from "@/env.schema";
import { ProposalesError, listCompanies } from "./client";

/**
 * The company's public inbox token, needed to create RFPs.
 *
 * It is not an env var: it lives on the Company object, so it is fetched once
 * and cached for a few minutes rather than being configured by hand.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;

export function configuredCompanyId(): number {
  const { PROPOSALES_COMPANY_ID } = loadEnv();
  const companyId = Number(PROPOSALES_COMPANY_ID);

  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new Error(
      `PROPOSALES_COMPANY_ID must be a positive integer, got "${PROPOSALES_COMPANY_ID}"`,
    );
  }

  return companyId;
}

export async function getInboxToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const companyId = configuredCompanyId();
  const company = (await listCompanies()).find((candidate) => candidate.id === companyId);

  if (!company) {
    throw new ProposalesError(
      `This API key has no access to company ${companyId}.`,
      { method: "GET", path: "/v3/companies" },
    );
  }

  if (!company.inbox_token) {
    throw new ProposalesError(
      `Company "${company.name}" has no inbox token, so RFPs cannot be created.`,
      { method: "GET", path: "/v3/companies" },
    );
  }

  cached = { token: company.inbox_token, expiresAt: Date.now() + CACHE_TTL_MS };

  return cached.token;
}

/** Test seam; also used if a sync fails and we want a fresh lookup. */
export function clearInboxTokenCache(): void {
  cached = null;
}
