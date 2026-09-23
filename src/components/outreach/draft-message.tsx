"use client";

import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { markAsContacted, regenerateMessage } from "@/lib/outreach/actions";
import { checkMessage, wordCount } from "@/lib/outreach/message-prompt";

/**
 * The drafted outreach message (D17).
 *
 * Editable, because the manager sends it themselves from their own mail client
 * — nothing here sends anything. "Mark as contacted" only records that they
 * did, which hides the lead for 90 days.
 */

const WARNING_TEXT = {
  price: "This mentions money. Outreach should not quote a price or offer a discount.",
  availability: "This implies something is available or held. We have not checked that.",
} as const;

export function DraftMessage({
  inquiryId,
  today,
  from,
  to,
  initialMessage,
  initialError,
  contacted,
}: {
  inquiryId: string;
  today: string;
  from: string;
  to: string;
  initialMessage: string;
  initialError: string | null;
  contacted: boolean;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState(initialError);
  const [copied, setCopied] = useState(false);
  const [isDrafting, startDrafting] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const warnings = checkMessage(message);
  const words = wordCount(message);

  function regenerate() {
    startDrafting(async () => {
      const result = await regenerateMessage({ inquiryId, today, from, to });

      if (result.ok) {
        setMessage(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Could not copy — select the text and copy it manually.");
    }
  }

  function contact() {
    startSaving(async () => {
      const result = await markAsContacted({ inquiryId, today, from, to, message });

      if (result.ok) toast.success("Marked as contacted. Hidden from the radar for 90 days.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={10}
        aria-label="Outreach message"
        placeholder={isDrafting ? "Writing…" : "No draft yet — use Regenerate."}
        disabled={isDrafting}
      />

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs tabular-nums">
        <span className={words > 120 ? "text-destructive" : undefined}>{words} words</span>
        {words > 120 ? <span>— outreach reads better under 120</span> : null}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {warnings.map((warning) => (
        <p key={warning.rule} className="text-destructive flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {WARNING_TEXT[warning.rule]} Found: “{warning.match}”
          </span>
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button onClick={contact} disabled={isSaving || isDrafting || !message.trim()}>
          {contacted ? "Mark as contacted again" : "Mark as contacted"}
        </Button>

        <Button variant="outline" onClick={copy} disabled={!message.trim()}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>

        <Button variant="outline" onClick={regenerate} disabled={isDrafting}>
          <RefreshCw className={isDrafting ? "size-4 animate-spin" : "size-4"} aria-hidden />
          {isDrafting ? "Writing…" : "Regenerate"}
        </Button>
      </div>
    </div>
  );
}
