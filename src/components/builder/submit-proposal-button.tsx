"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { submitProposal } from "@/lib/proposals/actions";

/**
 * The only path to a proposal in Proposales. Disabled until the draft is
 * ready, and while a submission is in flight so a double click cannot create
 * two proposals.
 */
export function SubmitProposalButton({
  inquiryId,
  label,
  disabled,
}: {
  inquiryId: string;
  label: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await submitProposal(inquiryId);

          if (!result.ok) {
            toast.error(result.error, {
              description: result.reasons?.join(" · "),
            });
            return;
          }

          const verb =
            result.action === "create"
              ? "Proposal created"
              : result.action === "patch"
                ? "Draft updated"
                : `Version ${result.version} created`;

          toast.success(verb, {
            action: {
              label: "Open",
              onClick: () => window.open(result.url, "_blank", "noopener"),
            },
          });

          // Bring the history tab and status badges back in step.
          router.refresh();
        });
      }}
    >
      {isPending ? "Working…" : label}
      {isPending ? null : <ExternalLink className="size-3.5 opacity-70" aria-hidden />}
    </Button>
  );
}
