import type { Cadence } from "@/lib/db/schema";
import type { OutcomeSegment } from "./types";

/** How the radar's two badge families are worded and styled. */

type BadgeStyle = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
};

export const OUTCOME_BADGE: Record<OutcomeSegment, BadgeStyle> = {
  accepted: {
    label: "Accepted",
    variant: "secondary",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected: { label: "Rejected", variant: "destructive" },
  quoted: { label: "Quoted, no answer", variant: "secondary" },
  no_proposal: { label: "Never quoted", variant: "outline" },
};

export const CADENCE_BADGE: Record<Cadence, BadgeStyle> = {
  annual: { label: "Annual", variant: "outline" },
  quarterly: { label: "Quarterly", variant: "outline" },
  monthly: { label: "Monthly", variant: "outline" },
  one_off: { label: "One-off", variant: "outline", className: "text-muted-foreground" },
  unknown: { label: "Unknown", variant: "outline", className: "text-muted-foreground" },
};
