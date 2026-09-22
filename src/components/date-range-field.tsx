"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateCompact } from "@/lib/format";
import { cn } from "cn";

/** `Date` → `YYYY-MM-DD`, using local parts so the picked day is the day stored. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM-DD` → local `Date`, avoiding the UTC shift of `new Date(iso)`. */
function fromIsoDate(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;

  const [, year, month, day] = match;

  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function DateRangeField({
  startDate,
  endDate,
  onChange,
  invalid,
}: {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selected: DateRange | undefined = startDate
    ? { from: fromIsoDate(startDate), to: fromIsoDate(endDate || startDate) }
    : undefined;

  function handleSelect(range: DateRange | undefined) {
    if (!range?.from) {
      onChange({ startDate: "", endDate: "" });
      return;
    }

    const from = toIsoDate(range.from);
    // While picking, `to` is undefined until the second click; treat the range
    // as a single day until then.
    const to = range.to ? toIsoDate(range.to) : from;

    onChange({ startDate: from, endDate: to });

    if (range.to) setOpen(false);
  }

  const label = !startDate
    ? "Pick dates"
    : !endDate || endDate === startDate
      ? formatDateCompact(startDate)
      : `${formatDateCompact(startDate)} → ${formatDateCompact(endDate)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className={cn(
            "w-full justify-start font-normal",
            !startDate && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          autoFocus
          defaultMonth={selected?.from}
          selected={selected}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
