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

export function InquiryTable({ inquiries }: { inquiries: InquiryListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contact</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>First event</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Proposal</TableHead>
          <TableHead className="text-right">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {inquiries.map((inquiry) => {
          const status = deriveInquiryStatus(inquiry.activeProposalStatus);
          const badge = INQUIRY_STATUS_VARIANT[status];

          return (
            <TableRow key={inquiry.id} className="hover:bg-muted/50 relative">
              <TableCell className="font-medium">
                {/* The whole row is clickable via this stretched link. */}
                <Link
                  href={`/inquiries/${inquiry.id}`}
                  className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                >
                  {inquiry.contactName}
                </Link>
                {inquiry.companyName ? (
                  <span className="text-muted-foreground block text-xs">{inquiry.companyName}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{inquiry.email}</TableCell>
              <TableCell>
                {inquiry.firstEventDate ? (
                  formatDateCompact(inquiry.firstEventDate)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={badge.variant} className={badge.className}>
                  {status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {inquiry.activeProposalStatus ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-right">
                {formatTimestamp(inquiry.createdAt)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
