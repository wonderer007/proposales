import Link from "next/link";

import { CompanySwitcher } from "@/components/company-switcher";
import { getCompanies, getSelectedCompany } from "@/lib/proposales/companies";

/**
 * Slim app bar shared by every page. Gives the pages a common top edge and a
 * way home; page-specific actions stay in each page's header.
 */
export async function SiteHeader() {
  // A workspace the key cannot reach, or an unreachable API, must not take the
  // whole app down — the header just drops the switcher.
  const workspace = await Promise.all([getCompanies(), getSelectedCompany()])
    .then(([companies, selected]) => ({ companies, selected }))
    .catch(() => null);

  return (
    <header className="border-b">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 rounded-sm text-sm font-semibold tracking-tight outline-none focus-visible:ring-3"
        >
          Inquiry to proposal
        </Link>

        {/* The wordmark on the left is already the way home, so the bar
            carries only the workspace. */}
        {workspace ? (
          <CompanySwitcher companies={workspace.companies} selectedId={workspace.selected.id} />
        ) : null}
      </div>
    </header>
  );
}
