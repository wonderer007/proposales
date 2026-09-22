"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { removeDraftItem } from "@/lib/builder/actions";

export function RemoveItemButton({
  inquiryId,
  itemId,
  title,
}: {
  inquiryId: string;
  itemId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      disabled={isPending}
      aria-label={`Remove ${title}`}
      onClick={() => {
        startTransition(async () => {
          const result = await removeDraftItem(inquiryId, itemId);
          if (!result.ok) toast.error(result.error);
        });
      }}
    >
      <X className="size-3.5" />
    </Button>
  );
}
