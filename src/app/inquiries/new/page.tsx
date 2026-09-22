import Link from "next/link";

import { InquiryForm } from "@/components/inquiry-form";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "New inquiry",
};

export default function NewInquiryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="mb-8 space-y-1">
        <Button asChild variant="link" className="h-auto p-0 text-sm">
          <Link href="/">← Back to inquiries</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New inquiry</h1>
        <p className="text-muted-foreground text-sm">
          Saved here and mirrored to Proposales as a request for proposal.
        </p>
      </header>

      <InquiryForm />
    </main>
  );
}
