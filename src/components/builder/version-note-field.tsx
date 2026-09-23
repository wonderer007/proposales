"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateVersionNote } from "@/lib/builder/actions";

/**
 * The "What's changed" note sent with the next version. The agent drafts it;
 * the manager edits it here, and it reaches the customer in the proposal.
 */
export function VersionNoteField({
  inquiryId,
  versionNote,
}: {
  inquiryId: string;
  versionNote: string | null;
}) {
  const [value, setValue] = useState(versionNote ?? "");
  const [isPending, startTransition] = useTransition();

  const [last, setLast] = useState(versionNote ?? "");
  if ((versionNote ?? "") !== last) {
    setLast(versionNote ?? "");
    setValue(versionNote ?? "");
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="version-note" className="text-xs">
        What&rsquo;s changed — shown to the customer
      </Label>
      <Textarea
        id="version-note"
        rows={2}
        value={value}
        disabled={isPending}
        placeholder="Summarise the change for the customer"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value === (versionNote ?? "")) return;

          startTransition(async () => {
            const result = await updateVersionNote(inquiryId, value.trim() || null);
            if (!result.ok) toast.error(result.error);
          });
        }}
        className="resize-none text-xs"
      />
    </div>
  );
}
