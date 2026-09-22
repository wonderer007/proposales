import { describe, expect, test } from "bun:test";

import { toIsoDate } from "./date-range-field";

describe("toIsoDate", () => {
  test("uses local date parts, not UTC", () => {
    // 23:30 local on the 14th must stay the 14th, even where UTC is already the 15th.
    expect(toIsoDate(new Date(2026, 9, 14, 23, 30))).toBe("2026-10-14");
    expect(toIsoDate(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });

  test("zero-pads month and day", () => {
    expect(toIsoDate(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});
