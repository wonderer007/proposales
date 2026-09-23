/**
 * The only place the outreach feature is allowed to ask what day it is (D17).
 *
 * Everything else takes `today` as a parameter, so the whole radar is pure and
 * the reviewer can time-travel with `?today=YYYY-MM-DD`. A stray `new Date()`
 * elsewhere in the feature would break both properties.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a well-formed calendar date, e.g. not `2026-02-31`. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Today as ISO `YYYY-MM-DD`, or the `?today=` override when it is a valid date.
 *
 * The override is honoured everywhere, including production: this is a review
 * build whose seed data only makes sense from a fixed vantage point, and it
 * affects nothing outside the outreach screens.
 */
export function getToday(override?: string | string[] | null): string {
  const candidate = Array.isArray(override) ? override[0] : override;
  if (candidate && isIsoDate(candidate)) return candidate;
  return new Date().toISOString().slice(0, 10);
}

/** Default radar window: today through today + 60 days. */
export const DEFAULT_RANGE_DAYS = 60;
