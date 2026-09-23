import { describe, expect, test } from "bun:test";

import { getToday, isIsoDate } from "./today";

describe("isIsoDate", () => {
  test("accepts a real calendar date", () => {
    expect(isIsoDate("2026-10-05")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  test("rejects a date that does not exist", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  test("rejects anything not shaped YYYY-MM-DD", () => {
    expect(isIsoDate("5 October 2026")).toBe(false);
    expect(isIsoDate("2026-10-05T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("getToday", () => {
  test("honours a valid override", () => {
    expect(getToday("2026-10-05")).toBe("2026-10-05");
  });

  test("takes the first value when the param is repeated", () => {
    expect(getToday(["2026-10-05", "2026-01-01"])).toBe("2026-10-05");
  });

  test("falls back to the real date when the override is junk", () => {
    const real = new Date().toISOString().slice(0, 10);
    expect(getToday("not-a-date")).toBe(real);
    expect(getToday("2026-02-31")).toBe(real);
    expect(getToday(null)).toBe(real);
    expect(getToday()).toBe(real);
  });
});
