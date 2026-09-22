import { describe, expect, test } from "bun:test";

import {
  addFlag,
  addItem,
  clearFlag,
  confirmDate,
  emptyDraft,
  parseDraft,
  removeEvent,
  removeItem,
  setQuantity,
  setRequirements,
  upsertEvent,
  workingDraftSchema,
  type CatalogProduct,
  type WorkingDraft,
} from "./draft";

const meetingRoom: CatalogProduct = {
  productId: 1,
  variationId: 101,
  title: "Vasa Room",
  unit: "day",
  contentType: "meetingRoom",
  unitPriceMinor: 85_000,
  vatRate: 0.25,
  currency: "EUR",
};

const lunch: CatalogProduct = {
  productId: 2,
  variationId: 102,
  title: "Lunch buffet",
  unit: "person",
  contentType: "food",
  unitPriceMinor: 3_200,
  vatRate: 0.12,
  currency: "EUR",
};

const room: CatalogProduct = { ...meetingRoom, productId: 3, variationId: 103, title: "Standard double room", unit: "night", contentType: "accommodation" };

const baseEvent = {
  id: "e1",
  type: "meeting" as const,
  label: "Quarterly meeting",
  date: "2026-10-14",
  startTime: "09:00",
  endTime: "16:00",
  headcount: 25,
  inferred: [],
};

function draftWithEvent(): WorkingDraft {
  return upsertEvent(emptyDraft(), baseEvent);
}

describe("emptyDraft / parseDraft", () => {
  test("an empty draft validates against the schema", () => {
    expect(workingDraftSchema.safeParse(emptyDraft()).success).toBe(true);
  });

  test("parseDraft falls back for null and for malformed JSON", () => {
    expect(parseDraft(null).events).toEqual([]);
    expect(parseDraft({ nonsense: true }).events).toEqual([]);
    expect(parseDraft(null, "sv").language).toBe("sv");
  });

  test("parseDraft round-trips a real draft", () => {
    const draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: lunch });

    expect(parseDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
});

describe("upsertEvent", () => {
  test("adds an event with dateConfirmed false", () => {
    const draft = draftWithEvent();

    expect(draft.events).toHaveLength(1);
    expect(draft.events[0]?.dateConfirmed).toBe(false);
  });

  test("changing the date resets dateConfirmed", () => {
    let draft = confirmDate(draftWithEvent(), "e1", true);
    expect(draft.events[0]?.dateConfirmed).toBe(true);

    draft = upsertEvent(draft, { ...baseEvent, date: "2026-10-15" });
    expect(draft.events[0]?.dateConfirmed).toBe(false);
  });

  test("editing something other than the date keeps the confirmation", () => {
    let draft = confirmDate(draftWithEvent(), "e1", true);
    draft = upsertEvent(draft, { ...baseEvent, label: "Board meeting" });

    expect(draft.events[0]?.dateConfirmed).toBe(true);
    expect(draft.events[0]?.label).toBe("Board meeting");
  });

  test("a headcount change recomputes computed quantities", () => {
    let draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: lunch });
    expect(draft.items[0]?.quantity).toBe(25);

    draft = upsertEvent(draft, { ...baseEvent, headcount: 60 });
    expect(draft.items[0]?.quantity).toBe(60);
    expect(draft.items[0]?.quantitySource).toBe("computed");
  });

  test("a time change recomputes hourly quantities", () => {
    const studio: CatalogProduct = { ...meetingRoom, variationId: 104, title: "Studio", unit: "h" };
    let draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: studio });
    expect(draft.items[0]?.quantity).toBe(7);

    draft = upsertEvent(draft, { ...baseEvent, endTime: "12:30" });
    expect(draft.items[0]?.quantity).toBe(3.5);
  });

  test("a manual quantity survives a headcount change but gets a flag", () => {
    let draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: lunch });
    draft = setQuantity(draft, "i1", 30);

    draft = upsertEvent(draft, { ...baseEvent, headcount: 60 });

    expect(draft.items[0]?.quantity).toBe(30);
    expect(draft.items[0]?.quantitySource).toBe("manual");
    expect(draft.flags.some((flag) => flag.itemId === "i1" && flag.severity === "warning")).toBe(true);
  });

  test("setting the quantity again clears the staleness flag", () => {
    let draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: lunch });
    draft = setQuantity(draft, "i1", 30);
    draft = upsertEvent(draft, { ...baseEvent, headcount: 60 });
    expect(draft.flags).toHaveLength(1);

    draft = setQuantity(draft, "i1", 60);
    expect(draft.flags).toHaveLength(0);
  });
});

describe("addItem", () => {
  test("sizes a person-priced product from the headcount", () => {
    const draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: lunch });

    expect(draft.items[0]).toMatchObject({
      variationId: 102,
      quantity: 25,
      quantitySource: "computed",
      unitPriceMinor: 3_200,
      vatRate: 0.12,
    });
  });

  test("raises a flag for a night-priced product", () => {
    const draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: room });

    expect(draft.items[0]?.quantity).toBe(1);
    expect(draft.flags[0]?.id).toBe("i1:confirm-nights");
  });

  test("ignores an unknown event", () => {
    const draft = addItem(draftWithEvent(), { id: "i1", eventId: "nope", product: lunch });

    expect(draft.items).toHaveLength(0);
  });

  test("keeps a note when given one", () => {
    const draft = addItem(draftWithEvent(), {
      id: "i1", eventId: "e1", product: lunch, note: "Vegetarian option",
    });

    expect(draft.items[0]?.note).toBe("Vegetarian option");
  });
});

describe("removeEvent and removeItem", () => {
  test("removing an event drops its items and flags", () => {
    let draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: room });
    expect(draft.flags).toHaveLength(1);

    draft = removeEvent(draft, "e1");

    expect(draft.events).toHaveLength(0);
    expect(draft.items).toHaveLength(0);
    expect(draft.flags).toHaveLength(0);
  });

  test("removing an item unmatches the requirement that pointed at it", () => {
    let draft = addItem(draftWithEvent(), { id: "i1", eventId: "e1", product: lunch });
    draft = setRequirements(draft, [
      { id: "r1", text: "Projector", status: "matched", itemId: "i1" },
    ]);

    draft = removeItem(draft, "i1");

    expect(draft.items).toHaveLength(0);
    expect(draft.requirements[0]).toMatchObject({ status: "unmatched", itemId: undefined });
  });
});

describe("flags", () => {
  test("addFlag replaces a flag with the same id rather than duplicating", () => {
    let draft = addFlag(emptyDraft(), { id: "f1", severity: "info", message: "One" });
    draft = addFlag(draft, { id: "f1", severity: "warning", message: "Two" });

    expect(draft.flags).toHaveLength(1);
    expect(draft.flags[0]?.message).toBe("Two");
  });

  test("clearFlag removes it", () => {
    let draft = addFlag(emptyDraft(), { id: "f1", severity: "info", message: "One" });
    draft = clearFlag(draft, "f1");

    expect(draft.flags).toHaveLength(0);
  });
});

describe("purity", () => {
  test("operations never mutate the draft they are given", () => {
    const original = draftWithEvent();
    const snapshot = JSON.parse(JSON.stringify(original));

    addItem(original, { id: "i1", eventId: "e1", product: lunch });
    upsertEvent(original, { ...baseEvent, headcount: 99 });
    confirmDate(original, "e1", true);
    removeEvent(original, "e1");

    expect(original).toEqual(snapshot);
  });
});
