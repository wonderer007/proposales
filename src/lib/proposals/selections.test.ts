import { describe, expect, test } from "bun:test";

import {
  addItem,
  emptyDraft,
  setItemOptions,
  upsertEvent,
  type CatalogProduct,
} from "@/lib/builder/draft";
import { describeSelections, readRecipientSelections } from "./selections";

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

const spa: CatalogProduct = {
  productId: 3, variationId: 103, title: "Spa access", unit: "person",
  contentType: "other", unitPriceMinor: 4_000, vatRate: 0.25, currency: "EUR",
};

const at = new Date("2026-09-23T10:00:00Z");

function snapshot() {
  let draft = upsertEvent(emptyDraft(), {
    id: "e1", type: "meeting", date: "2026-11-05",
    startTime: "09:00", endTime: "12:00", headcount: 50, inferred: [],
  });
  draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });
  draft = setItemOptions(draft, "i1", { quantityEditable: true, quantityMin: 40, quantityMax: 60 });

  return addItem(draft, { id: "i2", eventId: "e1", product: spa, role: "addon" });
}

describe("readRecipientSelections", () => {
  test("reports nothing when the recipient has not touched it", () => {
    const result = readRecipientSelections(
      snapshot(),
      [
        { content_id: 102, quantity: 50 },
        { content_id: 103, quantity: 50, optional: true },
      ],
      at,
    );

    expect(result.changes).toEqual([]);
  });

  test("an absent optional_picked is not a deselection", () => {
    // Proposales omits the field until the recipient actually decides.
    const result = readRecipientSelections(snapshot(), [{ content_id: 103, optional: true }], at);

    expect(result.changes).toEqual([]);
  });

  test("reports a deselected optional line", () => {
    const result = readRecipientSelections(
      snapshot(),
      [{ content_id: 103, optional: true, optional_picked: false }],
      at,
    );

    expect(result.changes).toEqual([{ variationId: 103, title: "Spa access", deselected: true }]);
  });

  test("reports a quantity the recipient moved", () => {
    const result = readRecipientSelections(snapshot(), [{ content_id: 102, quantity: 46 }], at);

    expect(result.changes).toEqual([
      { variationId: 102, title: "Lunch buffet", quantityWas: 50, quantityNow: 46 },
    ]);
  });

  test("ignores a quantity change on a line that was never flexible", () => {
    const fixed = addItem(emptyDraft(), { id: "x", eventId: "none", product: lunch });
    const result = readRecipientSelections(fixed, [{ content_id: 102, quantity: 99 }], at);

    expect(result.changes).toEqual([]);
  });

  test("ignores blocks that are not on the snapshot", () => {
    expect(readRecipientSelections(snapshot(), [{ content_id: 999, quantity: 1 }], at).changes)
      .toEqual([]);
  });

  test("records when it was checked", () => {
    expect(readRecipientSelections(snapshot(), [], at).checkedAt).toBe("2026-09-23T10:00:00.000Z");
  });
});

describe("describeSelections", () => {
  test("reads as plain sentences", () => {
    const selections = readRecipientSelections(
      snapshot(),
      [
        { content_id: 102, quantity: 46 },
        { content_id: 103, optional: true, optional_picked: false },
      ],
      at,
    );

    expect(describeSelections(selections)).toEqual([
      "Customer set Lunch buffet to 46 (was 50)",
      "Customer deselected: Spa access",
    ]);
  });

  test("says nothing when there is nothing to say", () => {
    expect(describeSelections(null)).toEqual([]);
  });
});
