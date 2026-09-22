import Link from "next/link";

import { InquirySearch } from "@/components/inquiry-search";
import { InquiryTable } from "@/components/inquiry-table";
import { Button } from "@/components/ui/button";
import { listInquiries } from "@/lib/db/queries";

export const metadata = {
  title: "Inquiries",
};

export default async function InquiryListPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) ?? "";

  const inquiries = await listInquiries({ q: query });
  const isSearching = query.trim().length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inquiries</h1>
          <p className="text-muted-foreground text-sm">
            Requests from customers, and the proposal built for each one.
          </p>
        </div>
        <Button asChild>
          <Link href="/inquiries/new">New inquiry</Link>
        </Button>
      </header>

      <div className="mb-4">
        <InquirySearch />
      </div>

      {inquiries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <InquiryTable inquiries={inquiries} />
        </div>
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
            Add the first one, or run <code className="text-xs">bun run db:seed</code> for samples.
          </p>
          <Button asChild className="mt-4">
            <Link href="/inquiries/new">New inquiry</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
