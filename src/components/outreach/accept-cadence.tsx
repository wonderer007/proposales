"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptCadence } from "@/lib/outreach/actions";
import { CADENCE_BADGE } from "@/lib/outreach/badges";
import type { Cadence } from "@/lib/db/schema";

/**
 * The classifier's suggestion for an inquiry it was not sure enough about
 * (D17).
 *
 * Accepting is the manager's only cadence edit: they confirm what was guessed,
 * they do not pick one of their own.
 */
export function AcceptCadence({
  inquiryId,
  cadence,
  confidence,
  evidence,
}: {
  inquiryId: string;
  cadence: Cadence;
  confidence: number | null;
  evidence: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptCadence({ inquiryId, cadence });

      if (result.ok) toast.success(`Cadence set to ${CADENCE_BADGE[cadence].label.toLowerCase()}.`);
      else toast.error(result.error);
    });
  }

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm">
        This looks like a{" "}
        <span className="font-medium">{CADENCE_BADGE[cadence].label.toLowerCase()}</span> event, but
        not confidently enough to suggest on its own
        {confidence !== null ? ` (${Math.round(confidence * 100)}% sure)` : ""}.
      </p>

      {evidence ? <p className="text-muted-foreground text-sm italic">{evidence}</p> : null}

      <Button size="sm" variant="outline" onClick={accept} disabled={isPending}>
        {isPending ? "Saving…" : `Accept ${CADENCE_BADGE[cadence].label.toLowerCase()}`}
      </Button>
    </div>
  );
}
