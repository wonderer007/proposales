import { cookies } from "next/headers";

import { loadEnv } from "@/env.schema";
import { ProposalesError, listCompanies } from "./client";
import type { Company } from "./schemas";

/**
 * The company ("workspace") the manager is working in.
 *
 * Companies come from the Proposales API rather than configuration, so the
 * manager can switch between the ones their key can reach. The choice lives in
 * a cookie: server components read it directly, and it survives a reload.
 */

export const COMPANY_COOKIE = "proposales_company";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { companies: Company[]; expiresAt: number } | null = null;

/** Every company the API key can reach, cached briefly. */
export async function getCompanies(): Promise<Company[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.companies;

  const companies = await listCompanies();
  cache = { companies, expiresAt: Date.now() + CACHE_TTL_MS };

  return companies;
}

export function clearCompaniesCache(): void {
  cache = null;
}

/**
 * The company to act as, in order: the cookie, then `PROPOSALES_COMPANY_ID` if
 * it is set, then the first company the key can reach.
 *
 * A cookie naming a company the key cannot reach is ignored rather than
 * trusted — it is user input.
 */
export async function getSelectedCompany(): Promise<Company> {
  const companies = await getCompanies();

  if (companies.length === 0) {
    throw new ProposalesError("This API key cannot reach any company.", {
      method: "GET",
      path: "/v3/companies",
    });
  }

  // Scripts and the eval runner have no request, and so no cookie. `cookies()`
  // throws synchronously there, so this needs try/catch rather than .catch().
  let fromCookie = Number.NaN;
  try {
    const store = await cookies();
    fromCookie = Number(store.get(COMPANY_COOKIE)?.value);
  } catch {
    // No request scope — fall through to the env default or the first company.
  }

  const chosen = companies.find((company) => company.id === fromCookie);
  if (chosen) return chosen;

  const { PROPOSALES_COMPANY_ID } = loadEnv();
  const fromEnv = companies.find((company) => company.id === Number(PROPOSALES_COMPANY_ID));

  return fromEnv ?? companies[0]!;
}

export async function getSelectedCompanyId(): Promise<number> {
  return (await getSelectedCompany()).id;
}
