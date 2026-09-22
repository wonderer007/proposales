"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptItemSuggestion, rejectItemSuggestion } from "@/lib/builder/actions";
import type { ItemSuggestion } from "@/lib/builder/draft";

/** Describes a pending suggestion in the manager's terms. */
function describe(suggestion: ItemSuggestion): string[] {
  const parts: string[] = [];

  if (suggestion.role) parts.push(suggestion.role === "addon" ? "Mark as an add-on" : "Mark as core");
  if (suggestion.optional !== undefined) {
    parts.push(suggestion.optional ? "Make it optional" : "Make it required");
  }
  if (suggestion.quantityEditable) {
    const min = suggestion.quantityMin ?? null;
    const max = suggestion.quantityMax ?? null;
    const range =
      min !== null && max !== null
        ? `between ${min} and ${max}`
        : min !== null
          ? `from ${min} upwards`
          : max !== null
            ? `up to ${max}`
            : "";

    parts.push(`Let the customer adjust the quantity${range ? ` ${range}` : ""}`);
  } else if (suggestion.quantityEditable === false) {
    parts.push("Fix the quantity");
  }
  if (suggestion.comment) parts.push(`Add the note "${suggestion.comment}"`);

  return parts;
}

/**
 * An agent proposal that has not been accepted.
 *
 * Rendered distinctly — dashed, tinted, never styled like applied settings —
 * because nothing here is part of the offer until the manager clicks Apply.
 */
export function ItemSuggestionCard({
  inquiryId,
  itemId,
  suggestion,
}: {
  inquiryId: string;
  itemId: string;
  suggestion: ItemSuggestion;
}) {
  const [isPending, startTransition] = useTransition();

  function run(action: typeof acceptItemSuggestion) {
    startTransition(async () => {
      const result = await action(inquiryId, itemId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="border-primary/40 bg-primary/5 mt-2 space-y-2 rounded-md border border-dashed p-2">
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Suggested — not applied.</span> {suggestion.rationale}
        </span>
      </p>

      <ul className="text-muted-foreground space-y-0.5 pl-5 text-xs">
        {describe(suggestion).map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>

      <div className="flex gap-2 pl-5">
        <Button
          type="button"
          size="sm"
          className="h-7"
          disabled={isPending}
          onClick={() => run(acceptItemSuggestion)}
        >
          Apply suggestion
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={isPending}
          onClick={() => run(rejectItemSuggestion)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
