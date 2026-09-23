import { describe, expect, test } from "bun:test";

import { addItem, emptyDraft, upsertEvent, type CatalogProduct } from "./draft";
import { shouldHydrateFromSnapshot } from "./hydrate";

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

function populated() {
  const draft = upsertEvent(emptyDraft(), {
    id: "e1", type: "meeting", date: "2026-11-05",
    startTime: "09:00", endTime: "12:00", headcount: 50, inferred: [],
  });

  return addItem(draft, { id: "i1", eventId: "e1", product: lunch });
}

const proposalAt = new Date("2026-09-23T10:00:00Z");

describe("shouldHydrateFromSnapshot", () => {
  test("never hydrates when there is no proposal", () => {
    expect(
      shouldHydrateFromSnapshot({
        draft: emptyDraft(),
        draftUpdatedAt: new Date("2026-09-01T00:00:00Z"),
        activeProposalCreatedAt: null,
      }),
    ).toBe(false);
  });

  test("hydrates an empty draft", () => {
    expect(
      shouldHydrateFromSnapshot({
        draft: emptyDraft(),
        draftUpdatedAt: new Date("2026-09-23T12:00:00Z"),
        activeProposalCreatedAt: proposalAt,
      }),
    ).toBe(true);
  });

  test("hydrates a draft untouched since the proposal", () => {
    expect(
      shouldHydrateFromSnapshot({
        draft: populated(),
        draftUpdatedAt: new Date("2026-09-23T09:00:00Z"),
        activeProposalCreatedAt: proposalAt,
      }),
    ).toBe(true);
  });

  test("never overwrites work in progress", () => {
    // Edited after the proposal was created: the manager is mid-revision.
    expect(
      shouldHydrateFromSnapshot({
        draft: populated(),
        draftUpdatedAt: new Date("2026-09-23T11:00:00Z"),
        activeProposalCreatedAt: proposalAt,
      }),
    ).toBe(false);
  });

  test("treats an equal timestamp as stale, not as work in progress", () => {
    expect(
      shouldHydrateFromSnapshot({
        draft: populated(),
        draftUpdatedAt: proposalAt,
        activeProposalCreatedAt: proposalAt,
      }),
    ).toBe(true);
  });
});
