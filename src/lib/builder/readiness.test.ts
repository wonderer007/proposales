import { describe, expect, test } from "bun:test";

import { addItem, confirmDate, emptyDraft, setQuantity, upsertEvent, type CatalogProduct } from "./draft";
import { checkReadiness } from "./readiness";

const TODAY = "2026-09-22";
const known = new Set([101, 102]);

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

const event = {
  id: "e1", type: "meeting" as const, label: "Quarterly meeting", date: "2026-10-14",
  startTime: "09:00", endTime: "16:00", headcount: 25, inferred: [],
};

function readyDraft() {
  let draft = upsertEvent(emptyDraft(), event);
  draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });

  return confirmDate(draft, "e1", true);
}

describe("checkReadiness", () => {
  test("a complete draft is ready", () => {
    expect(checkReadiness(readyDraft(), { knownVariationIds: known, today: TODAY })).toEqual({
      ready: true, reasons: [],
    });
  });

  test("an empty draft needs an event", () => {
    const result = checkReadiness(emptyDraft(), { knownVariationIds: known, today: TODAY });

    expect(result.ready).toBe(false);
    expect(result.reasons).toEqual(["Add at least one event."]);
  });

  test("an unconfirmed date blocks it", () => {
    let draft = upsertEvent(emptyDraft(), event);
    draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });

    const result = checkReadiness(draft, { knownVariationIds: known, today: TODAY });

    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("Quarterly meeting: confirm the date with the checkbox.");
  });

  test("a missing date, time or headcount each give a reason", () => {
    let draft = upsertEvent(emptyDraft(), {
      ...event, date: null, startTime: null, headcount: null,
    });
    draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });

    const { reasons } = checkReadiness(draft, { knownVariationIds: known, today: TODAY });

    expect(reasons).toContain("Quarterly meeting: no date yet.");
    expect(reasons).toContain("Quarterly meeting: start and end time are needed.");
    expect(reasons).toContain("Quarterly meeting: how many guests?");
  });

  test("a date in the past blocks it", () => {
    let draft = upsertEvent(emptyDraft(), { ...event, date: "2026-09-01" });
    draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });
    draft = confirmDate(draft, "e1", true);

    const { ready, reasons } = checkReadiness(draft, { knownVariationIds: known, today: TODAY });

    expect(ready).toBe(false);
    expect(reasons).toContain("Quarterly meeting: Tuesday, 1 September 2026 is in the past.");
  });

  test("today itself is not in the past", () => {
    let draft = upsertEvent(emptyDraft(), { ...event, date: TODAY });
    draft = addItem(draft, { id: "i1", eventId: "e1", product: lunch });
    draft = confirmDate(draft, "e1", true);

    expect(checkReadiness(draft, { knownVariationIds: known, today: TODAY }).ready).toBe(true);
  });

  test("an event with no items blocks it", () => {
    const draft = confirmDate(upsertEvent(emptyDraft(), event), "e1", true);
    const { reasons } = checkReadiness(draft, { knownVariationIds: known, today: TODAY });

    expect(reasons).toContain("Quarterly meeting: nothing selected yet.");
  });

  test("a product missing from the library blocks it", () => {
    const { ready, reasons } = checkReadiness(readyDraft(), {
      knownVariationIds: new Set([999]), today: TODAY,
    });

    expect(ready).toBe(false);
    expect(reasons).toContain('"Lunch buffet" is no longer in the content library.');
  });

  test("a zero quantity blocks it", () => {
    const draft = setQuantity(readyDraft(), "i1", 0);
    const { ready, reasons } = checkReadiness(draft, { knownVariationIds: known, today: TODAY });

    expect(ready).toBe(false);
    expect(reasons).toContain('"Lunch buffet": quantity must be more than zero.');
  });

  test("reports every problem at once, not just the first", () => {
    const draft = upsertEvent(emptyDraft(), { ...event, date: null, headcount: 0 });
    const { reasons } = checkReadiness(draft, { knownVariationIds: known, today: TODAY });

    expect(reasons.length).toBeGreaterThan(2);
  });
});
