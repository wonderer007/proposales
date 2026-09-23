"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { COMPANY_COOKIE, getCompanies } from "./companies";

/**
 * Switches the workspace.
 *
 * The id is checked against the companies the API key can actually reach, so a
 * hand-edited cookie cannot point the app at someone else's company.
 */
export async function selectCompany(companyId: number): Promise<{ ok: boolean; error?: string }> {
  const companies = await getCompanies();

  if (!companies.some((company) => company.id === companyId)) {
    return { ok: false, error: "That company is not available to this API key." };
  }

  const store = await cookies();
  store.set(COMPANY_COOKIE, String(companyId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Everything on screen — the library, totals, readiness — belongs to the
  // company that was active a moment ago.
  revalidatePath("/", "layout");

  return { ok: true };
}
