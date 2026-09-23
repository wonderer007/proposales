import { describe, expect, test } from "bun:test";

import {
  INTERVAL_DAYS,
  LEAD_DAYS,
  addDays,
  daysBetween,
  effectiveCadence,
  isSchedulable,
  isWithinRange,
  nextExpectedDate,
  recommendedContactDate,
} from "./cadence";

describe("addDays", () => {
  test("crosses a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  test("crosses a year boundary", () => {
    expect(addDays("2025-12-12", 365)).toBe("2026-12-12");
  });

  test("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("goes backwards", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("daysBetween", () => {
  test("counts forwards and backwards", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
  });
});

describe("nextExpectedDate", () => {
  test("adds the cadence interval", () => {
    expect(nextExpectedDate("2025-12-12", "annual")).toBe(addDays("2025-12-12", 365));
    expect(nextExpectedDate("2026-01-15", "quarterly")).toBe(addDays("2026-01-15", 91));
    expect(nextExpectedDate("2026-01-15", "monthly")).toBe(addDays("2026-01-15", 30));
  });

  test("uses the documented intervals", () => {
    expect(INTERVAL_DAYS).toEqual({ annual: 365, quarterly: 91, monthly: 30 });
  });
});

describe("recommendedContactDate", () => {
  test("subtracts the cadence lead time", () => {
    const expected = "2026-12-12";
    expect(daysBetween(recommendedContactDate(expected, "annual"), expected)).toBe(75);
    expect(daysBetween(recommendedContactDate(expected, "quarterly"), expected)).toBe(30);
    expect(daysBetween(recommendedContactDate(expected, "monthly"), expected)).toBe(14);
  });

  test("uses the documented lead days", () => {
    expect(LEAD_DAYS).toEqual({ annual: 75, quarterly: 30, monthly: 14 });
  });

  test("an annual December event is contacted in late September", () => {
    const expected = nextExpectedDate("2025-12-12", "annual");
    expect(expected).toBe("2026-12-12");
    expect(recommendedContactDate(expected, "annual")).toBe("2026-09-28");
  });
});

describe("isSchedulable", () => {
  test("accepts the three repeating cadences", () => {
    expect(isSchedulable("annual")).toBe(true);
    expect(isSchedulable("quarterly")).toBe(true);
    expect(isSchedulable("monthly")).toBe(true);
  });

  test("rejects one_off, unknown and absent", () => {
    expect(isSchedulable("one_off")).toBe(false);
    expect(isSchedulable("unknown")).toBe(false);
    expect(isSchedulable(null)).toBe(false);
    expect(isSchedulable(undefined)).toBe(false);
  });
});

describe("effectiveCadence", () => {
  test("keeps a confident classification", () => {
    expect(effectiveCadence("annual", 0.9, "ai")).toBe("annual");
  });

  test("0.7 is confident enough", () => {
    expect(effectiveCadence("annual", 0.7, "ai")).toBe("annual");
  });

  test("an unsure classification is never scheduled", () => {
    expect(effectiveCadence("annual", 0.69, "ai")).toBe("unknown");
  });

  test("a cadence the manager accepted is trusted regardless of confidence", () => {
    expect(effectiveCadence("annual", 0.2, "manager")).toBe("annual");
  });

  test("an unclassified inquiry is unknown", () => {
    expect(effectiveCadence(null, null, null)).toBe("unknown");
    expect(effectiveCadence("annual", null, "ai")).toBe("unknown");
  });
});

describe("isWithinRange", () => {
  test("includes both boundaries", () => {
    expect(isWithinRange("2026-10-01", "2026-10-01", "2026-12-01")).toBe(true);
    expect(isWithinRange("2026-12-01", "2026-10-01", "2026-12-01")).toBe(true);
  });

  test("excludes the days either side", () => {
    expect(isWithinRange("2026-09-30", "2026-10-01", "2026-12-01")).toBe(false);
    expect(isWithinRange("2026-12-02", "2026-10-01", "2026-12-01")).toBe(false);
  });
});
