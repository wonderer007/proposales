"use client";

import { LifeBuoy } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/builder/totals";
import { applyRecovery } from "@/lib/recovery/actions";
import type { RecoveryOption } from "@/lib/recovery/options";

/**
 * Recovery previews. Every figure is computed in code from the same functions
 * that apply the change, so what the manager sees is what they get.
 */
export function RecoveryOptions({
  inquiryId,
  options,
  unguided,
}: {
  inquiryId: string;
  options: RecoveryOption[];
  /** True when no reason was given, so the suggestions are not targeted. */
  unguided: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (options.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <LifeBuoy className="size-4" aria-hidden /> Ways to respond
        </h3>
        <p className="text-muted-foreground text-xs">
          {unguided
            ? "No reason was given, so these are untargeted — restructuring first, rather than cutting the price on a guess."
            : "Ordered by how much they concede. Applying one edits the draft; you still create the version yourself."}
        </p>
      </div>

      <ul className="space-y-2">
        {options.map((option) => (
          <li key={option.kind} className="space-y-2 rounded-md border p-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{option.title}</p>
              <p className="text-xs tabular-nums">
                {formatMoney(option.committedInclVatMinor, option.currency)}
                {option.deltaInclVatMinor !== 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({option.deltaInclVatMinor > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(option.deltaInclVatMinor), option.currency)})
                  </span>
                ) : null}
              </p>
            </div>

            <ul className="text-muted-foreground space-y-0.5 text-xs">
              {option.detail.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await applyRecovery(inquiryId, option.kind);
                  if (!result.ok) {
                    toast.error(result.error, { description: result.violations?.join(" · ") });
                  } else {
                    toast.success("Applied to the draft");
                  }
                });
              }}
            >
              Apply
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
