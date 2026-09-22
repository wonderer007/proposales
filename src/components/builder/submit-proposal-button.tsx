"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { submitProposal } from "@/lib/builder/actions";

/**
 * The only path to a proposal in Proposales. Disabled until the draft is
 * ready; the reasons are listed beside it.
 */
export function SubmitProposalButton({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      // Disabled while pending too, so a double click cannot submit twice.
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await submitProposal();
          if (!result.ok) toast.error(result.error);
          else toast.success("Proposal created");
        });
      }}
    >
      {isPending ? "Working…" : label}
    </Button>
  );
}
