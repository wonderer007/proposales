import Link from "next/link";

import { InquiryPagination } from "@/components/inquiry-pagination";
import { InquirySearch } from "@/components/inquiry-search";
import { InquiryTable } from "@/components/inquiry-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listInquiries } from "@/lib/db/queries";

export const metadata = {
  title: "Inquiries",
};

export default async function InquiryListPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) ?? "";

  const rawPage = params.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage) || 1;

  const { rows, total, page: current, pageCount } = await listInquiries({ q: query, page });
  const isSearching = query.trim().length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Inquiry Manager" }]}
        title="Inquiries"
        description="Requests from customers, and the proposal built for each one."
        actions={
          <Button asChild>
            <Link href="/inquiries/new">New inquiry</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <InquirySearch />
        {isSearching ? (
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {total} {total === 1 ? "match" : "matches"}
          </p>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-lg border">
            <InquiryTable inquiries={rows} />
          </div>
          <InquiryPagination page={current} pageCount={pageCount} total={total} query={query} />
        </>
      ) : isSearching ? (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No inquiries match “{query}”</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Search looks at the contact name and email address.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No inquiries yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Add the first one, or run{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">bun run db:seed</code>{" "}
            for samples.
          </p>
          <Button asChild className="mt-4">
            <Link href="/inquiries/new">New inquiry</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
