"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/**
 * Search box for the inquiry list. Debounces into the `q` search param, so the
 * server component re-queries and the URL stays shareable.
 */
export function InquirySearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const queryInUrl = searchParams.get("q") ?? "";
  const [value, setValue] = useState(queryInUrl);

  // Adjust state during render rather than in an effect, so back/forward
  // navigation puts the box back in step with the URL it restored.
  const [lastQueryInUrl, setLastQueryInUrl] = useState(queryInUrl);
  if (queryInUrl !== lastQueryInUrl) {
    setLastQueryInUrl(queryInUrl);
    setValue(queryInUrl);
  }

  useEffect(() => {
    if (value.trim() === queryInUrl) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");

      // A new search starts at the beginning; keeping the old page number
      // would land the manager on an empty page.
      params.delete("page");

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, queryInUrl, pathname, router, searchParams]);

  return (
    <div className="relative w-full max-w-sm">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by name or email"
        aria-label="Search inquiries by name or email"
        data-pending={isPending ? "" : undefined}
        className="pl-9"
      />
    </div>
  );
}
