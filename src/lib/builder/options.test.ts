import { describe, expect, test } from "bun:test";

import {
  addFlag,
  addItem,
  applyItemSuggestion,
  confirmDate,
  dismissItemSuggestion,
  emptyDraft,
  parseDraft,
  setItemDiscount,
  setItemOptions,
  setRequirements,
  removeItem,
  suggestItemOptions,
  upsertEvent,
  type CatalogProduct,
} from "./draft";
import { checkReadiness } from "./readiness";
import { calculateTotals, discountAmount, lineTotal, maximumQuantity } from "./totals";

const room: CatalogProduct = {
  productId: 1, variationId: 101, title: "Vasa Room", unit: "day",
  contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25, currency: "EUR",
};

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

const spa: CatalogProduct = {
  productId: 3, variationId: 103, title: "Spa access", unit: "person",
  contentType: "other", unitPriceMinor: 4_000, vatRate: 0.25, currency: "EUR",
};

const event = {
  id: "e1", type: "meeting" as const, label: "Meeting", date: "2026-10-14",
  startTime: "09:00", endTime: "16:00", headcount: 25, inferred: [],
};

function base() {
  return addItem(upsertEvent(emptyDraft(), event), { id: "i1", eventId: "e1", product: lunch });
}

describe("backwards compatibility", () => {
  test("a draft saved before this deliverable still loads", () => {
    // Exactly the shape written by the previous version: no role, optional,
    // quantityEditable, mode or revisionNote anywhere.
    const old = {
      language: "en",
      events: [{ ...event, dateConfirmed: true }],
      items: [
        {
          id: "i1", eventId: "e1", productId: 2, variationId: 102, title: "Lunch buffet",
          unit: "person", contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12,
          currency: "EUR", quantity: 25, quantitySource: "computed",
        },
      ],
      requirements: [],
      flags: [],
      budget: null,
    };

    const draft = parseDraft(old);

    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      role: "core", optional: false, optionalPicked: false,
      quantityEditable: false, quantityMin: null, quantityMax: null,
      discount: null, policyOverride: null, suggested: null,
    });
    expect(draft.events[0]).toMatchObject({
      dateConfirmed: true, headcountCertainty: "confirmed", headcountMin: null, headcountMax: null,
    });
    expect(draft.mode).toBe("normal");
    expect(draft.revisionNote).toBeNull();
  });
});

describe("add-on defaults (SPEC §6.5 rule 2)", () => {
  test("an add-on is optional and flexible from zero", () => {
    const draft = addItem(base(), { id: "i2", eventId: "e1", product: spa, role: "addon" });
    const item = draft.items[1]!;

    expect(item).toMatchObject({
      role: "addon", optional: true, optionalPicked: false,
      quantityEditable: true, quantityMin: 0, quantityMax: 25,
    });
  });

  test("a core item stays fixed and included", () => {
    expect(base().items[0]).toMatchObject({
      role: "core", optional: false, quantityEditable: false, quantityMin: null, quantityMax: null,
    });
  });
});

describe("setItemOptions", () => {
  test("applies what it is given and leaves the rest alone", () => {
    const draft = setItemOptions(base(), "i1", { quantityEditable: true, quantityMin: 20, quantityMax: 40 });

    expect(draft.items[0]).toMatchObject({ quantityEditable: true, quantityMin: 20, quantityMax: 40 });
    expect(draft.items[0]?.quantity).toBe(25);
  });

  test("turning flexible off clears the bounds", () => {
    let draft = setItemOptions(base(), "i1", { quantityEditable: true, quantityMin: 20, quantityMax: 40 });
    draft = setItemOptions(draft, "i1", { quantityEditable: false });

    expect(draft.items[0]).toMatchObject({ quantityMin: null, quantityMax: null });
  });

  test("an item that is not optional cannot be picked", () => {
    let draft = setItemOptions(base(), "i1", { optional: true, optionalPicked: true });
    expect(draft.items[0]?.optionalPicked).toBe(true);

    draft = setItemOptions(draft, "i1", { optional: false });
    expect(draft.items[0]?.optionalPicked).toBe(false);
  });
});

describe("suggestions", () => {
  const suggestion = {
    quantityEditable: true, quantityMin: 12, quantityMax: 16,
    rationale: "The headcount is uncertain",
  };

  test("suggesting changes nothing the customer would receive", () => {
    const draft = suggestItemOptions(base(), "i1", suggestion);

    expect(draft.items[0]?.suggested).toEqual(suggestion);
    // The applied settings are untouched.
    expect(draft.items[0]).toMatchObject({
      quantityEditable: false, quantityMin: null, quantityMax: null,
    });
  });

  test("applying copies the suggestion onto the item and clears it", () => {
    const draft = applyItemSuggestion(suggestItemOptions(base(), "i1", suggestion), "i1");

    expect(draft.items[0]).toMatchObject({
      quantityEditable: true, quantityMin: 12, quantityMax: 16, suggested: null,
    });
  });

  test("dismissing drops it and changes nothing else", () => {
    const draft = dismissItemSuggestion(suggestItemOptions(base(), "i1", suggestion), "i1");

    expect(draft.items[0]).toMatchObject({
      suggested: null, quantityEditable: false, quantityMin: null,
    });
  });

  test("suggesting twice replaces rather than stacks", () => {
    let draft = suggestItemOptions(base(), "i1", suggestion);
    draft = suggestItemOptions(draft, "i1", { optional: true, rationale: "Second thought" });

    expect(draft.items[0]?.suggested).toEqual({ optional: true, rationale: "Second thought" });
  });

  test("applying nothing is a no-op", () => {
    expect(applyItemSuggestion(base(), "i1")).toEqual(base());
  });
});

describe("discount maths", () => {
  test("a percent discount applies to the line value", () => {
    expect(discountAmount(100_000, { type: "percent", value: 0.1 })).toBe(10_000);
  });

  test("a fixed discount is already in minor units", () => {
    expect(discountAmount(100_000, { type: "fixed", value: 7_500 })).toBe(7_500);
  });

  test("a discount can never take a line below zero", () => {
    expect(discountAmount(5_000, { type: "fixed", value: 9_999 })).toBe(5_000);
    expect(discountAmount(5_000, { type: "percent", value: 2 })).toBe(5_000);
  });

  test("the line total reflects the discount and its VAT", () => {
    const draft = setItemDiscount(base(), "i1", { type: "percent", value: 0.1 });
    const line = lineTotal(draft.items[0]!);

    // 25 × 32.00 = 800.00, less 10% = 720.00, VAT 12% = 86.40
    expect(line).toMatchObject({
      grossExclVatMinor: 80_000, discountMinor: 8_000,
      exclVatMinor: 72_000, vatMinor: 8_640, inclVatMinor: 80_640,
    });
  });
});

describe("committed vs maximum totals (SPEC §6.5 rule 4)", () => {
  test("they match when nothing is optional or flexible", () => {
    const totals = calculateTotals(base());

    expect(totals.exclVatMinor).toBe(80_000);
    expect(totals.maximum.exclVatMinor).toBe(80_000);
    expect(totals.hasFlexibleValue).toBe(false);
  });

  test("an optional item counts towards the maximum only", () => {
    const draft = addItem(base(), { id: "i2", eventId: "e1", product: spa, role: "addon" });
    const totals = calculateTotals(draft);

    // Committed: lunch only. Maximum: lunch + 25 × 40.00 of spa.
    expect(totals.exclVatMinor).toBe(80_000);
    expect(totals.maximum.exclVatMinor).toBe(180_000);
    expect(totals.hasFlexibleValue).toBe(true);
  });

  test("a flexible quantity reaches its maximum in the ceiling total", () => {
    const draft = setItemOptions(base(), "i1", {
      quantityEditable: true, quantityMin: 20, quantityMax: 40,
    });
    const totals = calculateTotals(draft);

    expect(totals.exclVatMinor).toBe(80_000); // 25 × 32.00
    expect(totals.maximum.exclVatMinor).toBe(128_000); // 40 × 32.00
  });

  test("maximumQuantity never drops below the current quantity", () => {
    const draft = setItemOptions(base(), "i1", { quantityEditable: true, quantityMax: 10 });

    expect(maximumQuantity(draft.items[0]!)).toBe(25);
  });
});

describe("readiness with optional and flexible items", () => {
  const options = { knownVariationIds: new Set([101, 102, 103]), today: "2026-09-22" };

  function ready() {
    return confirmDate(addItem(upsertEvent(emptyDraft(), event), { id: "i1", eventId: "e1", product: room }), "e1", true);
  }

  test("an event of only optional items is not an offer", () => {
    const draft = setItemOptions(ready(), "i1", { optional: true });
    const { ready: isReady, reasons } = checkReadiness(draft, options);

    expect(isReady).toBe(false);
    expect(reasons).toContain("Meeting: everything is optional — at least one item must be included.");
  });

  test("an optional item alongside a core one is fine", () => {
    const draft = addItem(ready(), { id: "i2", eventId: "e1", product: spa, role: "addon" });

    expect(checkReadiness(draft, options).ready).toBe(true);
  });

  test("flexible quantity needs a bound", () => {
    const draft = setItemOptions(ready(), "i1", { quantityEditable: true });
    const { reasons } = checkReadiness(draft, options);

    expect(reasons).toContain('"Vasa Room": flexible quantity needs a minimum or a maximum.');
  });

  test("the quantity must sit inside its bounds", () => {
    const below = setItemOptions(ready(), "i1", { quantityEditable: true, quantityMin: 5 });
    expect(checkReadiness(below, options).reasons).toContain(
      '"Vasa Room": quantity 1 is below the minimum of 5.',
    );

    const above = setItemOptions(ready(), "i1", { quantityEditable: true, quantityMax: 0 });
    expect(checkReadiness(above, options).reasons).toContain(
      '"Vasa Room": quantity 1 is above the maximum of 0.',
    );
  });

  test("a minimum above the maximum is rejected", () => {
    const draft = setItemOptions(ready(), "i1", {
      quantityEditable: true, quantityMin: 10, quantityMax: 5,
    });

    expect(checkReadiness(draft, options).reasons).toContain('"Vasa Room": the minimum is above the maximum.');
  });

  test("an optional item may sit at zero", () => {
    let draft = addItem(ready(), { id: "i2", eventId: "e1", product: spa, role: "addon" });
    draft = { ...draft, items: draft.items.map((i) => (i.id === "i2" ? { ...i, quantity: 0 } : i)) };

    expect(checkReadiness(draft, options).ready).toBe(true);
  });

  test("optional and flexible alone never block readiness", () => {
    const draft = setItemOptions(ready(), "i1", {
      quantityEditable: true, quantityMin: 1, quantityMax: 3,
    });

    expect(checkReadiness(draft, options).ready).toBe(true);
  });
});

describe("warnings when a product is removed", () => {
  function withWarnings() {
    let draft = addItem(upsertEvent(emptyDraft(), event), { id: "i1", eventId: "e1", product: room });
    draft = setRequirements(draft, [
      { id: "r1", text: "Room with projector", status: "matched", itemId: "i1" },
    ]);
    draft = addFlag(draft, {
      id: "f-item", severity: "warning", eventId: "e1", itemId: "i1",
      message: "Capacity not verified for Vasa Room",
    });

    // The agent's own warning, attached to the event rather than the line.
    return addFlag(draft, {
      id: "f-event", severity: "warning", eventId: "e1",
      message: "Vasa Room may be too small for 25 boardroom style",
    });
  }

  test("clears the warning scoped to the removed item", () => {
    expect(removeItem(withWarnings(), "i1").flags.map((flag) => flag.id)).not.toContain("f-item");
  });

  test("clears a warning that merely mentions the removed product", () => {
    // It would otherwise describe something no longer on the offer.
    expect(removeItem(withWarnings(), "i1").flags).toEqual([]);
  });

  test("keeps the warning when another line still carries that product", () => {
    const twice = addItem(withWarnings(), { id: "i2", eventId: "e1", product: room });
    const after = removeItem(twice, "i1");

    expect(after.flags.map((flag) => flag.id)).toEqual(["f-event"]);
  });

  test("keeps warnings about other products", () => {
    const draft = addFlag(withWarnings(), {
      id: "f-other", severity: "info", eventId: "e1", message: "Lunch buffet needs a final count",
    });

    expect(removeItem(draft, "i1").flags.map((flag) => flag.id)).toEqual(["f-other"]);
  });

  test("still unmatches the requirement it covered", () => {
    expect(removeItem(withWarnings(), "i1").requirements[0]).toMatchObject({
      status: "unmatched", itemId: undefined,
    });
  });

  test("removing an unknown item changes nothing", () => {
    expect(removeItem(withWarnings(), "nope")).toEqual(withWarnings());
  });
});
