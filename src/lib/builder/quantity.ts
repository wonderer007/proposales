import type { Unit } from "@/lib/proposales/schemas";

/** A flag the quantity rules ask the caller to raise. */
export type QuantityFlag = {
  /** Stable suffix, combined with the item id so repeated runs don't duplicate. */
  kind: "confirm-nights" | "review-quantity";
  severity: "info" | "warning";
  message: string;
};

export type QuantityResult = { quantity: number; flag?: QuantityFlag };

/** Whatever the rules need from an event to size a line. */
export type QuantityContext = {
  headcount: number | null;
  startTime: string | null;
  endTime: string | null;
};

/** `HH:mm[:ss]` → minutes since midnight, or null if unparseable. */
function toMinutes(time: string | null): number | null {
  if (!time) return null;

  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Hours between two times, rounded up to the next half hour (SPEC §6.2).
 * An end at or before the start is treated as crossing midnight.
 */
export function hoursBetween(startTime: string | null, endTime: string | null): number | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return null;

  const minutes = end > start ? end - start : end + 24 * 60 - start;

  return Math.ceil(minutes / 30) / 2;
}

/**
 * Quantity for one line, from the product's unit and its event (SPEC §6.2).
 *
 * Returns a quantity of 0 when the event does not yet carry what the rule
 * needs — readiness then blocks the proposal until the manager fills it in.
 */
export function quantityForUnit(unit: Unit, event: QuantityContext): QuantityResult {
  switch (unit) {
    case "person":
      return { quantity: event.headcount ?? 0 };

    case "day":
      // One event is one date, so a day-priced product is one day.
      return { quantity: 1 };

    case "h": {
      const hours = hoursBetween(event.startTime, event.endTime);
      return { quantity: hours ?? 0 };
    }

    case "night":
      return {
        quantity: 1,
        flag: {
          kind: "confirm-nights",
          severity: "warning",
          message: "Confirm the number of nights — defaulted to 1.",
        },
      };

    default:
      return {
        quantity: 1,
        flag: {
          kind: "review-quantity",
          severity: "warning",
          message: `Review the quantity for this ${unit}-priced product — defaulted to 1.`,
        },
      };
  }
}
