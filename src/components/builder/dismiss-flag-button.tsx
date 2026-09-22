"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { dismissFlag } from "@/lib/builder/actions";

export function DismissFlagButton({
  inquiryId,
  flagId,
}: {
  inquiryId: string;
  flagId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 shrink-0"
      disabled={isPending}
      aria-label="Dismiss warning"
      onClick={() => {
        startTransition(async () => {
          const result = await dismissFlag(inquiryId, flagId);
          if (!result.ok) toast.error(result.error);
        });
      }}
    >
      <X className="size-3" />
    </Button>
  );
}
