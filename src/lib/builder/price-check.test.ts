import { describe, expect, test } from "bun:test";

import { addItem, emptyDraft, upsertEvent, type CatalogProduct } from "./draft";
import { applyPriceChanges, findPriceChanges } from "./price-check";

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

function draft() {
  const base = upsertEvent(emptyDraft(), {
    id: "e1", type: "lunch", date: "2026-11-05",
    startTime: "12:00", endTime: "13:00", headcount: 50, inferred: [],
  });

  return addItem(base, { id: "i1", eventId: "e1", product: lunch });
}

describe("findPriceChanges", () => {
  test("finds nothing when prices match", () => {
    expect(findPriceChanges(draft(), [lunch])).toEqual([]);
  });

  test("reports a price that moved", () => {
    expect(findPriceChanges(draft(), [{ ...lunch, unitPriceMinor: 3_500 }])).toEqual([
      { itemId: "i1", title: "Lunch buffet", wasMinor: 3_200, nowMinor: 3_500, currency: "EUR" },
    ]);
  });

  test("ignores an item that has left the library", () => {
    // Readiness already blocks on this; it is not a price change.
    expect(findPriceChanges(draft(), [])).toEqual([]);
  });
});

describe("applyPriceChanges", () => {
  test("updates the draft to the current price", () => {
    const changes = findPriceChanges(draft(), [{ ...lunch, unitPriceMinor: 3_500 }]);
    const updated = applyPriceChanges(draft(), changes);

    expect(updated.items[0]?.unitPriceMinor).toBe(3_500);
  });

  test("is a no-op when there is nothing to change", () => {
    expect(applyPriceChanges(draft(), [])).toEqual(draft());
  });
});
