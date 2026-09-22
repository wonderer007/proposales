import Link from "next/link";

/**
 * Slim app bar shared by every page. Gives the pages a common top edge and a
 * way home; page-specific actions stay in each page's header.
 */
export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 rounded-sm text-sm font-semibold tracking-tight outline-none focus-visible:ring-3"
        >
          Inquiry to proposal
        </Link>

        <nav aria-label="Primary">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-sm text-sm outline-none transition-colors focus-visible:ring-3"
          >
            Inquiries
          </Link>
        </nav>
      </div>
    </header>
  );
}
