"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

/**
 * Shown when a route throws in production, where Next hides the real message.
 *
 * The digest is surfaced deliberately: it is the only handle a manager can
 * quote that ties their screen to a line in the server logs.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <PageHeader
        title="Something went wrong"
        description="The page could not be loaded. This is usually temporary — Proposales or the database may not have responded."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/inquiries">Back to inquiries</Link>
        </Button>
      </div>

      {error.digest ? (
        <p className="text-muted-foreground mt-6 text-xs">
          Reference <code className="bg-muted rounded px-1 py-0.5 font-mono">{error.digest}</code>{" "}
          — quote this if you report it.
        </p>
      ) : null}
    </main>
  );
}
