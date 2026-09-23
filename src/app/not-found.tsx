import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <PageHeader
        title="Not found"
        description="That inquiry does not exist, or it has been removed."
      />

      <Button asChild>
        <Link href="/">Back to inquiries</Link>
      </Button>
    </main>
  );
}
