import type { ProposalStatus } from "@/lib/proposales/schemas";

/**
 * Inquiry status shown in the list (SPEC §4.1). Derived from the active
 * proposal's status, never stored.
 */
export type InquiryStatus = "New" | "Draft" | "Sent" | "Won" | "Lost" | "Expired" | "Withdrawn";

/**
 * Maps the active proposal's Proposales status onto the inquiry status.
 *
 * Proposales has no `sent` status — a proposal that has gone out is `active`,
 * which is what SPEC §4.1 calls "Sent". `replaced` means a newer version
 * superseded it; that row should not have been active, so it is treated as
 * sent rather than inventing a state.
 */
export function deriveInquiryStatus(proposalStatus: string | null | undefined): InquiryStatus {
  switch (proposalStatus as ProposalStatus | null | undefined) {
    case undefined:
    case null:
      return "New";
    case "draft":
    case "template":
      return "Draft";
    case "active":
    case "replaced":
      return "Sent";
    case "accepted":
      return "Won";
    case "rejected":
      return "Lost";
    case "expired":
      return "Expired";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "New";
  }
}

/** Badge styling per status. */
export const INQUIRY_STATUS_VARIANT: Record<
  InquiryStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  New: { variant: "outline" },
  Draft: { variant: "secondary" },
  Sent: { variant: "default" },
  Won: {
    variant: "secondary",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  Lost: { variant: "destructive" },
  Expired: { variant: "outline", className: "text-muted-foreground" },
  Withdrawn: { variant: "outline", className: "text-muted-foreground" },
};
