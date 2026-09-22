import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { RetrySyncButton } from "@/components/retry-sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InquiryWithEvents } from "@/lib/db/queries";
import { formatDateRange, formatTime } from "@/lib/format";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The customer's request as it arrived. The contact name is the page title
 * (rendered by the route), so this card starts with the details.
 */
export function InquiryHeader({ inquiry }: { inquiry: InquiryWithEvents }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inquiry</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Email">
            <a className="break-all hover:underline" href={`mailto:${inquiry.email}`}>
              {inquiry.email}
            </a>
          </Detail>
          <Detail label="Phone">
            {inquiry.phone ? <span className="tabular-nums">{inquiry.phone}</span> : "—"}
          </Detail>
        </dl>

        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs">Requested dates</h3>
          {inquiry.events.length > 0 ? (
            <ul className="space-y-1.5">
              {inquiry.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span>{formatDateRange(event.date, event.endDate)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatTime(event.startTime)}–{formatTime(event.endTime)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No dates given.</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs">Message</h3>
          <p className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap">{inquiry.message}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          {inquiry.rfpId ? (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              Mirrored to Proposales as RFP{" "}
              <span className="font-medium tabular-nums">#{inquiry.rfpId}</span>
            </p>
          ) : (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm">
                <AlertTriangle className="text-destructive size-4" aria-hidden />
                Not yet mirrored to Proposales
              </p>
              {inquiry.rfpSyncError ? (
                <p className="text-muted-foreground text-xs">{inquiry.rfpSyncError}</p>
              ) : null}
            </div>
          )}

          {inquiry.rfpId ? null : <RetrySyncButton inquiryId={inquiry.id} />}
        </div>
      </CardContent>
    </Card>
  );
}
