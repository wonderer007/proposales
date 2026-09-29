import { describe, expect, test } from "bun:test";

import { diffDrafts, draftsAreEquivalent } from "./diff";
import {
  addItem, emptyDraft, removeItem, setItemOptions, setQuantity, setRequirements, upsertEvent,
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

/**
 * How a line is presented is part of the offer. These diffs were missing, so
 * an option-only edit produced an empty diff and `submitProposalToProposales`
 * refused it as a no-op — the change never reached Proposales.
 */
describe("presentation changes", () => {
  test("making a line optional is a change", () => {
    const after = setItemOptions(base(), "i1", { optional: true });

    expect(draftsAreEquivalent(base(), after)).toBe(false);
    expect(diffDrafts(base(), after)).toEqual(["Lunch buffet: included → optional"]);
  });

  test("pre-selecting an optional line is a change", () => {
    const before = setItemOptions(base(), "i1", { optional: true });
    const after = setItemOptions(before, "i1", { optionalPicked: true });

    expect(diffDrafts(before, after)).toEqual([
      "Lunch buffet: optional → optional, pre-selected",
    ]);
  });

  test("making a quantity flexible is a change", () => {
    const after = setItemOptions(base(), "i1", {
      quantityEditable: true, quantityMin: 20, quantityMax: 60,
    });

    expect(diffDrafts(base(), after)).toEqual([
      "Lunch buffet: included → included, adjustable 20–60",
    ]);
  });

  test("an open-ended flexible quantity reads as a floor", () => {
    const after = setItemOptions(base(), "i1", { quantityEditable: true, quantityMin: 10 });

    expect(diffDrafts(base(), after)).toEqual([
      "Lunch buffet: included → included, adjustable from 10",
    ]);
  });

  test("moving the bounds of an already-flexible line is a change", () => {
    const before = setItemOptions(base(), "i1", {
      quantityEditable: true, quantityMin: 20, quantityMax: 60,
    });
    const after = setItemOptions(before, "i1", { quantityMax: 80 });

    expect(diffDrafts(before, after)).toEqual([
      "Lunch buffet: included, adjustable 20–60 → included, adjustable 20–80",
    ]);
  });

  test("turning flexibility off is a change", () => {
    const before = setItemOptions(base(), "i1", {
      quantityEditable: true, quantityMin: 20, quantityMax: 60,
    });
    const after = setItemOptions(before, "i1", { quantityEditable: false });

    expect(diffDrafts(before, after)).toEqual([
      "Lunch buffet: included, adjustable 20–60 → included",
    ]);
  });

  test("putting a line into a choice group is a change", () => {
    const after = setItemOptions(base(), "i1", { choiceGroup: "Catering" });

    expect(diffDrafts(base(), after)).toEqual([
      'Lunch buffet: included → one of "Catering"',
    ]);
  });

  test("adding, editing and removing the customer note are changes", () => {
    const added = setItemOptions(base(), "i1", { comment: "Vegetarian included" });
    expect(diffDrafts(base(), added)).toEqual(["Lunch buffet: note “Vegetarian included”"]);

    const edited = setItemOptions(added, "i1", { comment: "Vegan included" });
    expect(diffDrafts(added, edited)).toEqual(["Lunch buffet: note “Vegan included”"]);

    const removed = setItemOptions(edited, "i1", { comment: "" });
    expect(diffDrafts(edited, removed)).toEqual(["Lunch buffet: note removed"]);
  });

  test("a presentation change alone is enough to allow an update", () => {
    // The regression: this returned [] and the submission was refused.
    const after = setItemOptions(base(), "i1", { optional: true, quantityEditable: true });

    expect(diffDrafts(base(), after).length).toBeGreaterThan(0);
  });
});

describe("an item removed and re-added", () => {
  test("reads as one quantity change, not an add and a remove", () => {
    const before = base();
    // Same product on the same event, new id — what the agent does when it
    // re-adds a line so the quantity recomputes.
    const after = addItem(removeItem(before, "i1"), {
      id: "i2",
      eventId: "e1",
      product: { ...lunch },
    });
    const withMore = upsertEvent(after, { ...event, headcount: 60 });

    const changes = diffDrafts(before, withMore);

    expect(changes).not.toContain("Removed: Lunch buffet");
    expect(changes.some((line) => line.startsWith("Added: Lunch buffet"))).toBe(false);
    expect(changes).toContain("Lunch buffet: 45 → 60");
  });

  test("still reports a genuinely removed product", () => {
    expect(diffDrafts(base(), removeItem(base(), "i1"))).toContain("Removed: Lunch buffet");
  });
});
