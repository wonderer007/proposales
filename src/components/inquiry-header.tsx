import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { RetrySyncButton } from "@/components/retry-sync-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InquiryWithEvents } from "@/lib/db/queries";
import { formatDateRange, formatTime, formatTimestamp } from "@/lib/format";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function InquiryHeader({ inquiry }: { inquiry: InquiryWithEvents }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-xl">{inquiry.contactName}</CardTitle>
          {inquiry.companyName ? (
            <p className="text-muted-foreground text-sm">{inquiry.companyName}</p>
          ) : null}
        </div>
        <Badge variant="outline">{inquiry.language === "sv" ? "Svenska" : "English"}</Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Detail label="Email">
            <a className="hover:underline" href={`mailto:${inquiry.email}`}>
              {inquiry.email}
            </a>
          </Detail>
          <Detail label="Phone">{inquiry.phone ?? "—"}</Detail>
          <Detail label="Received">{formatTimestamp(inquiry.createdAt)}</Detail>
        </dl>

        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs">Requested dates</h3>
          {inquiry.events.length > 0 ? (
            <ul className="space-y-1">
              {inquiry.events.map((event) => (
                <li key={event.id} className="text-sm">
                  {formatDateRange(event.date, event.endDate)}
                  <span className="text-muted-foreground">
                    {" · "}
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
          <p className="text-sm whitespace-pre-wrap">{inquiry.message}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          {inquiry.rfpId ? (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              Mirrored to Proposales as RFP{" "}
              <span className="font-medium">#{inquiry.rfpId}</span>
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
