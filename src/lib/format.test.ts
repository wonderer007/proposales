import { describe, expect, test } from "bun:test";

import { formatDate, formatDateCompact, formatTime, formatTimestamp } from "./format";

describe("formatDate", () => {
  test("renders the weekday, as the spec requires", () => {
    expect(formatDate("2026-09-29")).toBe("Tuesday, 29 September 2026");
  });

  test("does not shift across a timezone boundary", () => {
    // A naive `new Date("2026-01-01")` formatted in a western zone yields 31 Dec.
    expect(formatDate("2026-01-01")).toBe("Thursday, 1 January 2026");
    expect(formatDate("2026-12-31")).toBe("Thursday, 31 December 2026");
  });

  test("passes through anything that is not an ISO date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDateCompact", () => {
  test("abbreviates for table cells", () => {
    expect(formatDateCompact("2026-10-14")).toBe("Wed, 14 Oct 2026");
  });
});

describe("formatTimestamp", () => {
  test("formats a stored timestamp", () => {
    expect(formatTimestamp(new Date(Date.UTC(2026, 8, 22, 12, 0, 0)))).toBe("22 Sep 2026");
  });
});

describe("formatTime", () => {
  test("trims the seconds Postgres returns", () => {
    expect(formatTime("09:00:00")).toBe("09:00");
    expect(formatTime("16:30:00")).toBe("16:30");
  });

  test("leaves an already-short time alone", () => {
    expect(formatTime("09:00")).toBe("09:00");
  });
});
