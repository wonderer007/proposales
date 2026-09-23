import { describe, expect, test } from "bun:test";

import type { DraftItem } from "@/lib/builder/draft";
import { PRICING_POLICY } from "./policy";
import { maxPercentFor, unitPriceAfterDiscount, validateDiscount } from "./validate";

const room: DraftItem = {
  id: "i1", eventId: "e1", productId: 1, variationId: 101, title: "Vasa Room",
  unit: "day", contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25,
  currency: "EUR", quantity: 1, quantitySource: "computed",
  role: "core", optional: false, optionalPicked: false, quantityEditable: false,
  quantityMin: null, quantityMax: null, discount: null, policyOverride: null, choiceGroup: null, suggested: null,
  comment: "Loyal customer rate",
};

describe("unitPriceAfterDiscount", () => {
  test("a percent comes off the unit price", () => {
    expect(unitPriceAfterDiscount(room, { type: "percent", value: 0.1 })).toBe(76_500);
  });

  test("a fixed amount is spread across the units", () => {
    const perPerson = { ...room, quantity: 50, unitPriceMinor: 3_200 };

    // 5000 minor over 50 units is 100 per unit.
    expect(unitPriceAfterDiscount(perPerson, { type: "fixed", value: 5_000 })).toBe(3_100);
  });

  test("never goes below zero", () => {
    expect(unitPriceAfterDiscount(room, { type: "percent", value: 2 })).toBe(0);
  });
});

describe("validateDiscount", () => {
  test("accepts a discount inside policy", () => {
    const result = validateDiscount(room, { type: "percent", value: 0.1 }, PRICING_POLICY);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.unitPriceAfterMinor).toBe(76_500);
  });

  test("refuses a discount over the cap", () => {
    const result = validateDiscount(room, { type: "percent", value: 0.25 }, PRICING_POLICY);

    expect(result.allowed).toBe(false);
    expect(result.violations[0]?.kind).toBe("over-max-percent");
    expect(result.violations[0]?.message).toContain("25% is above the 15% limit");
  });

  test("refuses a price below the floor", () => {
    const cheap = { ...room, unitPriceMinor: 42_000 };
    const result = validateDiscount(cheap, { type: "percent", value: 0.15 }, PRICING_POLICY);

    expect(result.violations.some((v) => v.kind === "below-floor")).toBe(true);
  });

  test("refuses a discount on an add-on", () => {
    const addon = { ...room, role: "addon" as const };
    const result = validateDiscount(addon, { type: "percent", value: 0.05 }, PRICING_POLICY);

    expect(result.violations.some((v) => v.kind === "addon-not-allowed")).toBe(true);
  });

  test("reports every violation at once", () => {
    const addon = { ...room, role: "addon" as const, unitPriceMinor: 42_000 };
    const result = validateDiscount(addon, { type: "percent", value: 0.9 }, PRICING_POLICY);

    expect(result.violations).toHaveLength(3);
  });

  test("flags a missing comment separately from a policy breach", () => {
    const silent = { ...room, comment: undefined };
    const result = validateDiscount(silent, { type: "percent", value: 0.1 }, PRICING_POLICY);

    // Within policy, but the customer would see a reduction with no reason.
    expect(result.allowed).toBe(true);
    expect(result.missingComment).toBe(true);
  });
});

describe("maxPercentFor", () => {
  test("is capped by the policy when the floor is far away", () => {
    expect(maxPercentFor(room, PRICING_POLICY)).toBe(PRICING_POLICY.maxPercentDiscount);
  });

  test("is capped by the floor when that binds first", () => {
    // 45000 with a 40000 floor leaves about 11%.
    expect(maxPercentFor({ ...room, unitPriceMinor: 45_000 }, PRICING_POLICY)).toBe(0.11);
  });

  test("is zero when the price is already at the floor", () => {
    expect(maxPercentFor({ ...room, unitPriceMinor: 40_000 }, PRICING_POLICY)).toBe(0);
  });
});
