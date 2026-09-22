/**
 * Date and time formatting shared by the UI.
 *
 * Dates are stored as plain `YYYY-MM-DD` strings with no timezone, so they are
 * parsed and formatted in UTC — formatting in the viewer's zone would shift
 * them by a day either side of midnight.
 */

const LOCALE = "en-GB";

function toUtcDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Tuesday, 29 September 2026" — the spec's canonical date format. */
export function formatDate(isoDate: string): string {
  const date = toUtcDate(isoDate);
  if (!date) return isoDate;

  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "Tue, 29 Sep 2026" — for table cells, where the long form is unwieldy. */
export function formatDateCompact(isoDate: string): string {
  const date = toUtcDate(isoDate);
  if (!date) return isoDate;

  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Formats a stored timestamp as "29 Sep 2026". */
export function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

/** Postgres returns `time` as `HH:mm:ss`; the UI wants `HH:mm`. */
export function formatTime(value: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}
