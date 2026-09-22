import { describe, expect, test } from "bun:test";

import { hoursBetween, quantityForUnit } from "./quantity";

const event = { headcount: 25, startTime: "09:00", endTime: "16:00" };

describe("hoursBetween", () => {
  test("counts whole hours", () => {
    expect(hoursBetween("09:00", "16:00")).toBe(7);
  });

  test("rounds up to the next half hour", () => {
    expect(hoursBetween("09:00", "11:15")).toBe(2.5);
    expect(hoursBetween("09:00", "11:31")).toBe(3);
    expect(hoursBetween("09:00", "11:30")).toBe(2.5);
  });

  test("tolerates the HH:mm:ss Postgres returns", () => {
    expect(hoursBetween("09:00:00", "12:00:00")).toBe(3);
  });

  test("treats an end before the start as crossing midnight", () => {
    expect(hoursBetween("22:00", "02:00")).toBe(4);
  });

  test("returns null when a time is missing", () => {
    expect(hoursBetween(null, "16:00")).toBeNull();
    expect(hoursBetween("09:00", null)).toBeNull();
  });
});

describe("quantityForUnit", () => {
  test("person uses the headcount", () => {
    expect(quantityForUnit("person", event).quantity).toBe(25);
  });

  test("person is 0 when the headcount is unknown", () => {
    expect(quantityForUnit("person", { ...event, headcount: null }).quantity).toBe(0);
  });

  test("day is one per event", () => {
    expect(quantityForUnit("day", event)).toEqual({ quantity: 1 });
  });

  test("h is the hours between start and end", () => {
    expect(quantityForUnit("h", event).quantity).toBe(7);
  });

  test("h is 0 when times are missing", () => {
    expect(quantityForUnit("h", { ...event, startTime: null }).quantity).toBe(0);
  });

  test("night defaults to 1 and asks for confirmation", () => {
    const result = quantityForUnit("night", event);

    expect(result.quantity).toBe(1);
    expect(result.flag?.kind).toBe("confirm-nights");
  });

  test("every other unit defaults to 1 with a review flag", () => {
    for (const unit of ["unit", "kg", "m", "month", "year", "sqm"] as const) {
      const result = quantityForUnit(unit, event);

      expect(result.quantity).toBe(1);
      expect(result.flag?.kind).toBe("review-quantity");
    }
  });

  test("neither day nor person raises a flag", () => {
    expect(quantityForUnit("day", event).flag).toBeUndefined();
    expect(quantityForUnit("person", event).flag).toBeUndefined();
    expect(quantityForUnit("h", event).flag).toBeUndefined();
  });
});
