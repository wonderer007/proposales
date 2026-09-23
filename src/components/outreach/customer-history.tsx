import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/builder/totals";
import { formatDateCompact } from "@/lib/format";
import type { Customer } from "@/lib/outreach/types";

/**
 * Everything this customer has ever asked us for (D17).
 *
 * Oldest first, so it reads as a story. A rejection reason is shown in full —
 * it is the most useful thing on the page when writing the message.
 */
export function CustomerHistory({ customer }: { customer: Customer }) {
  const oldestFirst = [...customer.inquiries].reverse();

  return (
    <ol className="space-y-4">
      {oldestFirst.map((inquiry) => {
        const types = [...new Set(inquiry.events.map((event) => event.type).filter(Boolean))];

        return (
          <li key={inquiry.id} className="border-l-2 pl-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium capitalize">
                {types.length > 0 ? types.join(" and ") : "Event"}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {inquiry.events.length > 0
                  ? inquiry.events.map((event) => formatDateCompact(event.date)).join(", ")
                  : "no date"}
              </span>
            </div>

            {inquiry.proposals.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {inquiry.proposals.map((proposal) => (
                  <li key={proposal.version} className="text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        v{proposal.version}
                      </span>
                      <Badge variant="outline" className="capitalize">
                        {proposal.status}
                      </Badge>
                      <span className="tabular-nums">
                        {formatMoney(proposal.valueMinor, proposal.currency)}
                      </span>
                    </span>
                    {proposal.rejectionReason ? (
                      <p className="text-muted-foreground mt-1 text-sm italic">
                        “{proposal.rejectionReason}”
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">Never quoted</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
