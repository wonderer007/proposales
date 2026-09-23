"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { DateRangeField } from "@/components/date-range-field";
import { Button } from "@/components/ui/button";

/**
 * The radar's date range (D17).
 *
 * The range lives in the URL rather than in state, so a scan is shareable and
 * the reviewer can drive it from the address bar. Any `?today=` override is
 * carried across, or time-travelling would end at the first click.
 */
export function OutreachRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [range, setRange] = useState({ startDate: from, endDate: to });
  const unchanged = range.startDate === from && range.endDate === to;

  function findLeads() {
    const params = new URLSearchParams(searchParams);
    params.set("from", range.startDate);
    params.set("to", range.endDate);

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* The field's trigger is `w-full`, so it needs a width of its own here
          or it pushes the button onto its own line. */}
      <div className="w-64">
        <DateRangeField
          startDate={range.startDate}
          endDate={range.endDate}
          onChange={setRange}
          invalid={range.startDate > range.endDate}
        />
      </div>

      <Button onClick={findLeads} disabled={isPending || range.startDate > range.endDate}>
        <Search className="size-4" aria-hidden />
        {isPending ? "Finding…" : "Find leads"}
      </Button>

      {unchanged ? null : (
        <p className="text-muted-foreground text-xs">Range changed — find leads to update.</p>
      )}
    </div>
  );
}
