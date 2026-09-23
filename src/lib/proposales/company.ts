import { ProposalesError } from "./client";
import { getSelectedCompany } from "./companies";

/**
 * The company's public inbox token, needed to create RFPs.
 *
 * It is not an env var: it lives on the Company object, so it is fetched once
 * and cached for a few minutes rather than being configured by hand.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { companyId: number; token: string; expiresAt: number } | null = null;



export async function getInboxToken(): Promise<string> {
  const company = await getSelectedCompany();

  // Cached per company: switching workspace must not reuse another's token.
  if (cached && cached.companyId === company.id && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  if (!company.inbox_token) {
    throw new ProposalesError(
      `Company "${company.name}" has no inbox token, so RFPs cannot be created.`,
      { method: "GET", path: "/v3/companies" },
    );
  }

  cached = {
    companyId: company.id,
    token: company.inbox_token,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return cached.token;
}

/** Test seam; also used if a sync fails and we want a fresh lookup. */
export function clearInboxTokenCache(): void {
  cached = null;
}
