import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Proposal } from "@/lib/db/schema";
import { formatTimestamp } from "@/lib/format";
import { INQUIRY_STATUS_VARIANT, deriveInquiryStatus } from "@/lib/inquiry-status";
import { cn } from "cn";

/**
 * Every version created in Proposales for this inquiry, newest first.
 * Rendered inside the proposal panel's "History" tab.
 */
export function ProposalHistory({ proposals }: { proposals: Proposal[] }) {
  if (proposals.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
        No proposal yet. Build a shortlist, then create one.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Proposales</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {proposals.map((proposal) => {
          const superseded = proposal.supersededAt !== null;
          const badge = INQUIRY_STATUS_VARIANT[deriveInquiryStatus(proposal.status)];

          return (
            <TableRow key={proposal.id} className={cn(superseded && "opacity-55")}>
              <TableCell className="font-medium tabular-nums">
                v{proposal.version}
                {superseded ? (
                  <span className="text-muted-foreground ml-2 text-xs">superseded</span>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={badge.variant} className={badge.className}>
                  {proposal.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatTimestamp(proposal.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <a
                  href={proposal.proposalesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm hover:underline"
                >
                  Open <ExternalLink className="size-3" aria-hidden />
                </a>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
