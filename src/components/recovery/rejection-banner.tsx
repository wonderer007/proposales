"use client";

import { AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RejectionCategory } from "@/lib/db/schema";
import { recordRejection } from "@/lib/recovery/actions";

const CATEGORIES: { value: RejectionCategory; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "availability", label: "Dates / availability" },
  { value: "scope", label: "Scope" },
  { value: "timing", label: "Timing" },
  { value: "competitor", label: "Went elsewhere" },
  { value: "no_reason", label: "They didn't say" },
  { value: "other", label: "Other" },
];

function labelFor(category: RejectionCategory): string {
  return CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

/**
 * Shown when a proposal comes back rejected.
 *
 * Nothing is suggested until a reason is recorded — including "they didn't
 * say", which is a complete answer (SPEC D15). Guessing the reason from the
 * numbers is exactly what this gate prevents.
 */
export function RejectionBanner({
  inquiryId,
  version,
  reason,
  category,
}: {
  inquiryId: string;
  version: number;
  reason: string | null;
  category: RejectionCategory | null;
}) {
  const [selected, setSelected] = useState<RejectionCategory | null>(category);
  const [note, setNote] = useState(reason ?? "");
  const [isPending, startTransition] = useTransition();

  if (category) {
    return (
      <div className="border-destructive/40 bg-destructive/5 space-y-1 rounded-lg border p-3">
        <p className="text-destructive flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4" aria-hidden />
          Version {version} was rejected
        </p>
        <p className="text-muted-foreground text-xs">
          Recorded as <span className="font-medium">{labelFor(category)}</span>
          {reason ? ` — “${reason}”` : null}
        </p>
      </div>
    );
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <p className="text-destructive flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4" aria-hidden />
          Version {version} was rejected
        </p>
        <p className="text-muted-foreground text-xs">
          Did the customer say why? Recovery suggestions wait until this is recorded.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selected === option.value ? "default" : "outline"}
            className="h-7"
            onClick={() => setSelected(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {selected ? (
        <div className="space-y-2">
          {selected !== "no_reason" ? (
            <div className="space-y-1">
              <Label htmlFor="rejection-note" className="text-xs">
                What did they say?
              </Label>
              <Input
                id="rejection-note"
                value={note}
                placeholder="In their words, if you have them"
                onChange={(event) => setNote(event.target.value)}
                className="h-8"
              />
            </div>
          ) : null}

          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const result = await recordRejection(
                  inquiryId,
                  selected === "no_reason" ? "They didn't say" : note.trim(),
                  selected,
                );
                if (!result.ok) toast.error(result.error);
              });
            }}
          >
            {isPending ? "Recording…" : "Record and show options"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
