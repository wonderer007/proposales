import { describe, expect, test } from "bun:test";

import { addItem, emptyDraft, setQuantity, upsertEvent, type CatalogProduct } from "./draft";
import { calculateTotals, formatMoney, lineTotal } from "./totals";

const event = {
  id: "e1", type: "meeting" as const, date: "2026-10-14",
  startTime: "09:00", endTime: "16:00", headcount: 25, inferred: [],
};

const room: CatalogProduct = {
  productId: 1, variationId: 101, title: "Vasa Room", unit: "day",
  contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25, currency: "EUR",
};

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

describe("lineTotal", () => {
  test("multiplies unit price by quantity and adds VAT", () => {
    expect(lineTotal({ id: "i1", unitPriceMinor: 3_200, quantity: 25, vatRate: 0.12, discount: null })).toMatchObject({
      itemId: "i1", exclVatMinor: 80_000, vatMinor: 9_600, inclVatMinor: 89_600,
    });
  });

  test("handles a fractional quantity from hourly pricing", () => {
    expect(lineTotal({ id: "i1", unitPriceMinor: 9_000, quantity: 3.5, vatRate: 0.25, discount: null })).toMatchObject({
      itemId: "i1", exclVatMinor: 31_500, vatMinor: 7_875, inclVatMinor: 39_375,
    });
  });

  test("rounds rather than leaving fractional minor units", () => {
    // 3.5 × 833 = 2915.5 → 2916, VAT 2916 × 0.12 = 349.92 → 350
    const line = lineTotal({ id: "i1", unitPriceMinor: 833, quantity: 3.5, vatRate: 0.12, discount: null });

    expect(Number.isInteger(line.exclVatMinor)).toBe(true);
    expect(Number.isInteger(line.vatMinor)).toBe(true);
    expect(line).toMatchObject({ itemId: "i1", exclVatMinor: 2_916, vatMinor: 350, inclVatMinor: 3_266 });
  });
});

describe("calculateTotals", () => {
  test("sums an empty draft to zero", () => {
    const totals = calculateTotals(emptyDraft());

    expect(totals.exclVatMinor).toBe(0);
    expect(totals.vatMinor).toBe(0);
    expect(totals.inclVatMinor).toBe(0);
  });

  test("adds up lines and splits VAT by rate", () => {
    let draft = upsertEvent(emptyDraft(), event);
    draft = addItem(draft, { id: "i1", eventId: "e1", product: room });
    draft = addItem(draft, { id: "i2", eventId: "e1", product: lunch });

    const totals = calculateTotals(draft);

    // room 850.00 + lunch 25 × 32.00 = 800.00 → 1650.00 excl VAT
    expect(totals.exclVatMinor).toBe(165_000);
    // 212.50 (25%) + 96.00 (12%)
    expect(totals.vatMinor).toBe(30_850);
    expect(totals.inclVatMinor).toBe(195_850);
    expect(totals.currency).toBe("EUR");

    expect(totals.vatByRate).toEqual([
      { rate: 0.12, exclVatMinor: 80_000, vatMinor: 9_600 },
      { rate: 0.25, exclVatMinor: 85_000, vatMinor: 21_250 },
    ]);
  });

  test("line totals always add up to the grand total", () => {
    let draft = upsertEvent(emptyDraft(), event);
    draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });
    draft = setQuantity(draft, "i1", 3.5);
    draft = addItem(draft, { id: "i2", eventId: "e1", product: room });

    const totals = calculateTotals(draft);
    const summed = totals.lines.reduce((sum, line) => sum + line.inclVatMinor, 0);

    expect(summed).toBe(totals.inclVatMinor);
  });

  test("a manual quantity feeds the totals", () => {
    let draft = upsertEvent(emptyDraft(), event);
    draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });
    draft = setQuantity(draft, "i1", 60);

    expect(calculateTotals(draft).exclVatMinor).toBe(192_000);
  });
});

describe("formatMoney", () => {
  test("renders minor units with two decimals", () => {
    expect(formatMoney(165_000, "EUR")).toBe("1650.00 EUR");
    expect(formatMoney(850, "EUR")).toBe("8.50 EUR");
    expect(formatMoney(0, "SEK")).toBe("0.00 SEK");
  });
});
