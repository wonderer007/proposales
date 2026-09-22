import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function ProposalHistory({ proposals }: { proposals: Proposal[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proposal history</CardTitle>
        <CardDescription>
          Every version created in Proposales for this inquiry, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {proposals.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
            No proposal yet. Build a shortlist on the card, then create one.
          </p>
        ) : (
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
                    <TableCell className="font-medium">
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
                    <TableCell className="text-muted-foreground">
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
        )}
      </CardContent>
    </Card>
  );
}
