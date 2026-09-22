import { describe, expect, test } from "bun:test";

import { diffDrafts, draftsAreEquivalent } from "./diff";
import {
  addItem, emptyDraft, removeItem, setQuantity, setRequirements, upsertEvent,
  type CatalogProduct,
} from "./draft";

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

const dinner: CatalogProduct = {
  ...lunch, productId: 3, variationId: 103, title: "Three-course dinner", unitPriceMinor: 6_900,
};

const event = {
  id: "e1", type: "lunch" as const, label: "Lunch", date: "2026-10-14",
  startTime: "12:00", endTime: "13:00", headcount: 45, inferred: [],
};

function base() {
  return addItem(upsertEvent(emptyDraft(), event), { id: "i1", eventId: "e1", product: lunch });
}

describe("diffDrafts", () => {
  test("an unchanged draft has no diff", () => {
    expect(diffDrafts(base(), base())).toEqual([]);
    expect(draftsAreEquivalent(base(), base())).toBe(true);
  });

  test("reports a headcount change", () => {
    const after = upsertEvent(base(), { ...event, headcount: 60 });

    expect(diffDrafts(base(), after)).toContain("Lunch: 45 → 60 people");
  });

  test("reports an added item", () => {
    const after = addItem(base(), { id: "i2", eventId: "e1", product: dinner });

    expect(diffDrafts(base(), after)).toContain("Added: Three-course dinner × 45");
  });

  test("reports a removed item", () => {
    expect(diffDrafts(base(), removeItem(base(), "i1"))).toContain("Removed: Lunch buffet");
  });

  test("reports a quantity change", () => {
    const after = setQuantity(base(), "i1", 50);

    expect(diffDrafts(base(), after)).toContain("Lunch buffet: 45 → 50");
  });

  test("reports a date change with weekdays", () => {
    const after = upsertEvent(base(), { ...event, date: "2026-10-15" });

    expect(diffDrafts(base(), after)).toContain(
      "Lunch: date Wednesday, 14 October 2026 → Thursday, 15 October 2026",
    );
  });

  test("reports a time change", () => {
    const after = upsertEvent(base(), { ...event, endTime: "14:00" });

    expect(diffDrafts(base(), after)).toContain("Lunch: 12:00–13:00 → 12:00–14:00");
  });

  test("reports added and removed events", () => {
    const after = upsertEvent(base(), {
      id: "e2", type: "dinner", label: "Dinner", date: "2026-10-14",
      startTime: "19:00", endTime: "22:00", headcount: 45, inferred: [],
    });

    expect(diffDrafts(base(), after)).toContain("Added event: Dinner");
    expect(diffDrafts(after, base())).toContain("Removed event: Dinner");
  });

  test("reports a requirement becoming unmatched", () => {
    const after = setRequirements(base(), [
      { id: "r1", text: "Projector", status: "unmatched" },
    ]);

    expect(diffDrafts(base(), after)).toContain('Requirement "Projector" is unmatched');
  });

  test("reports a language change", () => {
    const after = { ...base(), language: "sv" as const };

    expect(diffDrafts(base(), after)).toContain("Language: en → sv");
  });

  test("draftsAreEquivalent is false once anything changes", () => {
    expect(draftsAreEquivalent(base(), setQuantity(base(), "i1", 50))).toBe(false);
  });

  test("confirming a date alone is not a proposal-worthy change", () => {
    const after = { ...base(), events: base().events.map((e) => ({ ...e, dateConfirmed: true })) };

    expect(draftsAreEquivalent(base(), after)).toBe(true);
  });
});
