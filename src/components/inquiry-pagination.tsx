import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Page links for the inquiry list. Plain links rather than buttons, so a page
 * stays shareable and the browser's back button behaves.
 */
export function InquiryPagination({
  page,
  pageCount,
  total,
  query,
}: {
  page: number;
  pageCount: number;
  total: number;
  query: string;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (target > 1) params.set("page", String(target));

    const search = params.toString();
    return search ? `/inquiries?${search}` : "/inquiries";
  };

  return (
    <nav className="flex items-center justify-between gap-4 pt-4" aria-label="Pagination">
      <p className="text-muted-foreground text-xs tabular-nums">
        Page {page} of {pageCount} · {total} {total === 1 ? "inquiry" : "inquiries"}
      </p>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          {page <= 1 ? <span aria-disabled>Previous</span> : <Link href={href(page - 1)}>Previous</Link>}
        </Button>
        <Button asChild variant="outline" size="sm" disabled={page >= pageCount}>
          {page >= pageCount ? (
            <span aria-disabled>Next</span>
          ) : (
            <Link href={href(page + 1)}>Next</Link>
          )}
        </Button>
      </div>
    </nav>
  );
}
