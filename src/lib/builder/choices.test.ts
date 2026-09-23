import { describe, expect, test } from "bun:test";

import {
  addItem,
  choiceGroups,
  confirmDate,
  emptyDraft,
  setItemOptions,
  upsertEvent,
  type CatalogProduct,
} from "./draft";
import { checkReadiness } from "./readiness";
import { calculateTotals } from "./totals";
import { buildDescription } from "./to-proposal";

const vasa: CatalogProduct = {
  productId: 1, variationId: 101, title: "Vasa Room", unit: "day",
  contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25, currency: "EUR",
};
const skansen: CatalogProduct = { ...vasa, productId: 2, variationId: 102, title: "Skansen Room", unitPriceMinor: 80_000 };

const known = new Set([101, 102]);
const options = { knownVariationIds: known, today: "2026-09-23" };

const inquiry = {
  id: "i", contactName: "Anna Lindqvist", email: "a@b.c",
  phone: null, companyName: "Acme", rfpId: null,
};

function event() {
  const draft = upsertEvent(emptyDraft(), {
    id: "e1", type: "meeting", label: "Meeting", date: "2026-11-20",
    startTime: "09:00", endTime: "17:00", headcount: 30, inferred: [],
  });

  return confirmDate(draft, "e1", true);
}

/** Two rooms answering one requirement, for the customer to pick between. */
function twoAlternatives() {
  let draft = addItem(event(), { id: "i1", eventId: "e1", product: vasa });
  draft = addItem(draft, { id: "i2", eventId: "e1", product: skansen });
  draft = setItemOptions(draft, "i1", { choiceGroup: "the meeting room" });

  return setItemOptions(draft, "i2", { choiceGroup: "the meeting room" });
}

describe("offering the customer a choice", () => {
  test("does not block the proposal, even though every line is optional", () => {
    // The whole point of the change: picking one is expected, so the event is
    // a real offer despite having no required item.
    expect(checkReadiness(twoAlternatives(), options)).toEqual({ ready: true, reasons: [] });
  });

  test("an alternative is optional whether or not you asked for that", () => {
    // A required alternative is a contradiction.
    expect(twoAlternatives().items.every((item) => item.optional)).toBe(true);
  });

  test("all-optional with no choice is still not an offer", () => {
    const draft = setItemOptions(
      addItem(event(), { id: "i1", eventId: "e1", product: vasa }),
      "i1",
      { optional: true },
    );

    expect(checkReadiness(draft, options).reasons).toContain(
      "Meeting: everything is optional — at least one item must be included.",
    );
  });

  test("a group of one is rejected as a mislabelled optional item", () => {
    const draft = setItemOptions(
      addItem(event(), { id: "i1", eventId: "e1", product: vasa }),
      "i1",
      { choiceGroup: "the meeting room" },
    );

    expect(checkReadiness(draft, options).reasons).toContain(
      'Meeting: "the meeting room" offers only Vasa Room — a choice needs at least two.',
    );
  });

  test("groups the alternatives by name", () => {
    const groups = choiceGroups(twoAlternatives(), "e1");

    expect(groups.get("the meeting room")).toHaveLength(2);
  });
});

describe("what a choice costs", () => {
  test("counts one room, not both", () => {
    const totals = calculateTotals(twoAlternatives());

    // Committed takes the cheaper option, the ceiling the dearer — never the sum.
    expect(totals.exclVatMinor).toBe(80_000);
    expect(totals.maximum.exclVatMinor).toBe(85_000);
  });

  test("a picked alternative wins over price", () => {
    const draft = setItemOptions(twoAlternatives(), "i1", { optionalPicked: true });

    expect(calculateTotals(draft).exclVatMinor).toBe(85_000);
  });
});

describe("what the customer reads", () => {
  test("is told to pick one", () => {
    const description = buildDescription(twoAlternatives(), inquiry);

    expect(description).toContain("Choose one");
    expect(description).toContain("For the meeting room, pick whichever suits you");
    expect(description).toContain("- Vasa Room");
    expect(description).toContain("- Skansen Room");
  });

  test("is not told both rooms are reserved", () => {
    // The arrangements note would otherwise contradict the choice.
    expect(buildDescription(twoAlternatives(), inquiry)).not.toContain("rooms are reserved");
  });

  test("still explains genuinely booking two rooms", () => {
    let draft = addItem(event(), { id: "i1", eventId: "e1", product: vasa });
    draft = addItem(draft, { id: "i2", eventId: "e1", product: skansen });

    expect(buildDescription(draft, inquiry)).toContain("2 rooms are reserved");
  });
});
