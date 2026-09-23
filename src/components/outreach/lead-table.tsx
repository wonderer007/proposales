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
import { formatMoney } from "@/lib/builder/totals";
import { formatDateCompact } from "@/lib/format";
import { CADENCE_BADGE, OUTCOME_BADGE } from "@/lib/outreach/badges";
import type { Lead } from "@/lib/outreach/types";

/**
 * Leads for the selected range, sorted by recommended contact date (D17).
 *
 * The recommended date leads the row because that is what the manager acts on;
 * everything else is context for deciding whether to bother.
 */
export function LeadTable({ leads, search }: { leads: Lead[]; search: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Contact on</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead className="hidden lg:table-cell">Last event</TableHead>
          <TableHead className="hidden sm:table-cell">Cadence</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="pr-4 text-right">Last value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const { customer } = lead;
          const cadence = CADENCE_BADGE[customer.cadence];
          const outcome = OUTCOME_BADGE[customer.outcome];

          return (
            <TableRow key={customer.key} className="hover:bg-muted/50 relative">
              <TableCell className="py-3 pl-4 font-medium tabular-nums">
                {/* The whole row is clickable via this stretched link. */}
                <Link
                  href={`/outreach/${lead.sourceInquiryId}${search}`}
                  className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                >
                  {formatDateCompact(lead.recommendedContactDate)}
                </Link>
                <span className="text-muted-foreground block text-xs font-normal">
                  for {formatDateCompact(lead.nextExpectedDate)}
                </span>
              </TableCell>

              <TableCell>
                <span className="font-medium">{customer.contactName}</span>
                {customer.companyName ? (
                  <span className="text-muted-foreground block text-xs">
                    {customer.companyName}
                  </span>
                ) : null}
              </TableCell>

              <TableCell className="text-muted-foreground hidden lg:table-cell">
                {customer.lastEvent ? (
                  <>
                    <span className="capitalize">{customer.lastEvent.type ?? "Booking"}</span>
                    <span className="block text-xs tabular-nums">
                      {formatDateCompact(customer.lastEvent.date)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>

              <TableCell className="hidden sm:table-cell">
                <Badge variant={cadence.variant} className={cadence.className}>
                  {cadence.label}
                </Badge>
              </TableCell>

              <TableCell>
                <Badge variant={outcome.variant} className={outcome.className}>
                  {outcome.label}
                </Badge>
              </TableCell>

              <TableCell className="pr-4 text-right tabular-nums">
                {customer.lastProposal ? (
                  formatMoney(customer.lastProposal.valueMinor, customer.lastProposal.currency)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
