import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InquiryListRow } from "@/lib/db/queries";
import { formatDateCompact, formatTimestamp } from "@/lib/format";
import { INQUIRY_STATUS_VARIANT, deriveInquiryStatus } from "@/lib/inquiry-status";

/**
 * Columns fold into the Contact cell as the viewport narrows, so the table
 * never needs a horizontal scroll to reach the status or the row link.
 */
export function InquiryTable({ inquiries }: { inquiries: InquiryListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Contact</TableHead>
          <TableHead className="hidden md:table-cell">Email</TableHead>
          <TableHead>Event date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden pr-4 text-right sm:table-cell">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {inquiries.map((inquiry) => {
          const status = deriveInquiryStatus(inquiry.activeProposalStatus);
          const badge = INQUIRY_STATUS_VARIANT[status];

          return (
            <TableRow key={inquiry.id} className="hover:bg-muted/50 relative">
              <TableCell className="py-3 pl-4 font-medium">
                {/* The whole row is clickable via this stretched link. */}
                <Link
                  href={`/inquiries/${inquiry.id}`}
                  className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                >
                  {inquiry.contactName}
                </Link>
                {inquiry.companyName ? (
                  <span className="text-muted-foreground block text-xs font-normal">
                    {inquiry.companyName}
                  </span>
                ) : null}
                <span className="text-muted-foreground block text-xs font-normal md:hidden">
                  {inquiry.email}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground hidden md:table-cell">
                {inquiry.email}
              </TableCell>
              <TableCell className="tabular-nums">
                {inquiry.eventDate ? (
                  formatDateCompact(inquiry.eventDate)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <Badge variant={badge.variant} className={badge.className}>
                    {status}
                  </Badge>
                  {/* Which version that status belongs to, when there is one. */}
                  {inquiry.activeProposalVersion !== null ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      v{inquiry.activeProposalVersion}
                    </span>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground hidden pr-4 text-right tabular-nums sm:table-cell">
                {formatTimestamp(inquiry.createdAt)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
