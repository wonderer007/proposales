"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { confirmEventDate } from "@/lib/builder/actions";

/** The date checkbox. Only the manager can tick it (SPEC §7.2). */
export function DateConfirm({
  inquiryId,
  eventId,
  confirmed,
  disabled,
}: {
  inquiryId: string;
  eventId: string;
  confirmed: boolean;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const id = `confirm-${eventId}`;

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={confirmed}
        disabled={disabled || isPending}
        onCheckedChange={(checked) => {
          startTransition(async () => {
            const result = await confirmEventDate(inquiryId, eventId, checked === true);
            if (!result.ok) toast.error(result.error);
          });
        }}
      />
      <Label htmlFor={id} className="text-xs font-normal">
        Date confirmed
      </Label>
    </div>
  );
}
