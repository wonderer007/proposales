import type { Cadence } from "@/lib/db/schema";

/**
 * Cadence maths for the outreach radar (D17).
 *
 * Pure: dates are ISO `YYYY-MM-DD` strings in, ISO strings out, and "today" is
 * always a parameter. Nothing here reads the clock.
 */

/** Cadences that can be scheduled; `one_off` and `unknown` never are. */
export const SCHEDULABLE_CADENCES = ["annual", "quarterly", "monthly"] as const;
export type SchedulableCadence = (typeof SCHEDULABLE_CADENCES)[number];

/** How long until the event is expected to come round again. */
export const INTERVAL_DAYS: Record<SchedulableCadence, number> = {
  annual: 365,
  quarterly: 91,
  monthly: 30,
};

/** How far ahead of the expected date the manager should get in touch. */
export const LEAD_DAYS: Record<SchedulableCadence, number> = {
  annual: 75,
  quarterly: 30,
  monthly: 14,
};

/** A classification this unsure is treated as `unknown`, so it is never scheduled. */
export const MIN_CADENCE_CONFIDENCE = 0.7;

/** A lead is hidden for this long after the manager marks it contacted. */
export const CONTACTED_COOLDOWN_DAYS = 90;

/**
 * How close an existing inquiry has to be to count as "we already know about
 * this one". Any inquiry in the window suppresses the lead, whatever came of
 * it — a customer we already quoted for that date does not need a cold nudge.
 */
export const NEARBY_INQUIRY_WINDOW_DAYS = 14;

export function isSchedulable(cadence: Cadence | null | undefined): cadence is SchedulableCadence {
  return SCHEDULABLE_CADENCES.includes(cadence as SchedulableCadence);
}

/**
 * The cadence to schedule on.
 *
 * The classifier's raw answer is stored as-is so Screen 2 can still offer it as
 * a suggestion; the confidence threshold is applied here, at read time, rather
 * than by overwriting the answer with `unknown`.
 */
export function effectiveCadence(
  cadence: Cadence | null | undefined,
  confidence: number | null | undefined,
  source?: string | null,
): Cadence {
  if (!cadence) return "unknown";
  // A cadence the manager accepted is not second-guessed.
  if (source === "manager") return cadence;
  if (confidence === null || confidence === undefined) return "unknown";
  return confidence >= MIN_CADENCE_CONFIDENCE ? cadence : "unknown";
}

const MS_PER_DAY = 86_400_000;

/** Parses an ISO `YYYY-MM-DD` as a UTC timestamp, so no timezone can shift the day. */
function toUtcMs(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO date `days` after `isoDate`; a negative `days` goes backwards. */
export function addDays(isoDate: string, days: number): string {
  return fromUtcMs(toUtcMs(isoDate) + days * MS_PER_DAY);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

/** True when `isoDate` falls within `[from, to]`, both boundaries included. */
export function isWithinRange(isoDate: string, from: string, to: string): boolean {
  return isoDate >= from && isoDate <= to;
}

/** When the event is expected to come round again. */
export function nextExpectedDate(lastEventDate: string, cadence: SchedulableCadence): string {
  return addDays(lastEventDate, INTERVAL_DAYS[cadence]);
}

/** When the manager should get in touch about it. */
export function recommendedContactDate(
  nextExpected: string,
  cadence: SchedulableCadence,
): string {
  return addDays(nextExpected, -LEAD_DAYS[cadence]);
}

/** How a cadence reads in the UI. */
export const CADENCE_LABEL: Record<Cadence, string> = {
  annual: "Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
  one_off: "One-off",
  unknown: "Unknown",
};
