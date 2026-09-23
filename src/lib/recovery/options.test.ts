import { describe, expect, test } from "bun:test";

import { addItem, emptyDraft, upsertEvent, type CatalogProduct } from "@/lib/builder/draft";
import { calculateTotals } from "@/lib/builder/totals";
import { PRICING_POLICY } from "@/lib/pricing/policy";
import { applyRecoveryOption, buildRecoveryOptions } from "./options";

const vasa: CatalogProduct = {
  productId: 1, variationId: 101, title: "Vasa Room", unit: "day",
  contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25, currency: "EUR",
};
const skansen: CatalogProduct = { ...vasa, productId: 2, variationId: 102, title: "Skansen Room", unitPriceMinor: 80_000 };
const board: CatalogProduct = { ...vasa, productId: 3, variationId: 103, title: "Board Room", unitPriceMinor: 45_000 };
const lunch: CatalogProduct = {
  productId: 4, variationId: 104, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};
const pa: CatalogProduct = {
  productId: 5, variationId: 105, title: "PA system", unit: "unit",
  contentType: "other", unitPriceMinor: 9_500, vatRate: 0.25, currency: "EUR",
};

const library = [vasa, skansen, board, lunch, pa];

function draft() {
  let d = upsertEvent(emptyDraft(), {
    id: "e1", type: "meeting", label: "Meeting", date: "2026-11-05",
    startTime: "09:00", endTime: "17:00", headcount: 50, inferred: [],
  });
  d = addItem(d, { id: "i-room", eventId: "e1", product: vasa });
  d = addItem(d, { id: "i-lunch", eventId: "e1", product: lunch });

  return addItem(d, { id: "i-pa", eventId: "e1", product: pa, role: "addon" });
}

const input = { draft: draft(), library, policy: PRICING_POLICY, category: "price" as const };

describe("buildRecoveryOptions", () => {
  test("offers at most three, least concessive first", () => {
    const options = buildRecoveryOptions(input);

    expect(options.length).toBeLessThanOrEqual(3);
    expect(options.map((option) => option.kind)).toEqual([
      "restructure",
      "alternatives",
      "discount",
    ]);
  });

  test("withholds the discount when no reason was given", () => {
    // Leading with money on a guess is what the spec warns against.
    const options = buildRecoveryOptions({ ...input, category: "no_reason" });

    expect(options.map((option) => option.kind)).not.toContain("discount");
    expect(options[0]?.kind).toBe("restructure");
  });

  test("every option reports a real committed total", () => {
    for (const option of buildRecoveryOptions(input)) {
      const applied = applyRecoveryOption(draft(), option, library);

      expect(option.committedInclVatMinor).toBe(calculateTotals(applied).inclVatMinor);
    }
  });

  test("restructure softens the commitment without touching the price", () => {
    const [restructure] = buildRecoveryOptions(input);

    // The add-on is already optional by default, so what is left to soften is
    // the per-person line.
    expect(restructure?.changes.some((c) => c.type === "make-flexible")).toBe(true);
    expect(restructure?.changes.some((c) => c.type === "discount")).toBe(false);
    // Nothing is conceded on price, so the committed total cannot rise.
    expect(restructure!.deltaInclVatMinor).toBeLessThanOrEqual(0);
  });

  test("restructure makes a non-optional add-on optional", () => {
    // A manager may have marked an add-on as required; that is the first
    // thing to soften, and it does lower the committed total.
    const withRequiredAddon = {
      ...draft(),
      items: draft().items.map((item) =>
        item.id === "i-pa" ? { ...item, optional: false } : item,
      ),
    };

    const [restructure] = buildRecoveryOptions({ ...input, draft: withRequiredAddon });

    expect(restructure?.changes).toContainEqual({
      type: "make-optional", itemId: "i-pa", title: "PA system",
    });
    expect(restructure!.deltaInclVatMinor).toBeLessThan(0);
  });

  test("alternatives only ever swap to products from the library", () => {
    const alternatives = buildRecoveryOptions(input).find((o) => o.kind === "alternatives")!;
    const known = new Set(library.map((product) => product.variationId));

    for (const change of alternatives.changes) {
      if (change.type === "swap") expect(known.has(change.toVariationId)).toBe(true);
    }
  });

  test("alternatives pick the next cheapest, not the cheapest", () => {
    // Skansen (800) before Board Room (450): concede as little as possible.
    const alternatives = buildRecoveryOptions(input).find((o) => o.kind === "alternatives")!;
    const swap = alternatives.changes.find((c) => c.type === "swap" && c.itemId === "i-room");

    expect(swap).toMatchObject({ toVariationId: 102, toTitle: "Skansen Room" });
  });

  test("the discount never exceeds the policy cap", () => {
    const discount = buildRecoveryOptions(input).find((o) => o.kind === "discount")!;

    for (const change of discount.changes) {
      if (change.type === "discount") {
        expect(change.percent).toBeLessThanOrEqual(PRICING_POLICY.maxPercentDiscount);
      }
    }
  });

  test("the discount never touches an add-on", () => {
    const discount = buildRecoveryOptions(input).find((o) => o.kind === "discount")!;
    const titles = discount.changes.map((change) => change.title);

    expect(titles).not.toContain("PA system");
  });

  test("the discount never breaches a floor price", () => {
    const discount = buildRecoveryOptions(input).find((o) => o.kind === "discount")!;
    const applied = applyRecoveryOption(draft(), discount, library);

    for (const item of applied.items) {
      if (!item.discount) continue;

      const after = Math.round(item.unitPriceMinor * (1 - item.discount.value));
      expect(after).toBeGreaterThanOrEqual(
        PRICING_POLICY.floorUnitPriceMinorByType[item.contentType],
      );
    }
  });

  test("a draft with nothing to concede yields no options", () => {
    const bare = addItem(
      upsertEvent(emptyDraft(), {
        id: "e1", type: "meeting", date: "2026-11-05",
        startTime: "09:00", endTime: "17:00", headcount: 10, inferred: [],
      }),
      { id: "i1", eventId: "e1", product: board },
    );

    // Board Room is already the cheapest room and is not an add-on; only a
    // discount remains available.
    const options = buildRecoveryOptions({ ...input, draft: bare, category: "no_reason" });

    expect(options).toEqual([]);
  });
});

describe("applyRecoveryOption", () => {
  test("a swap keeps the line and its quantity", () => {
    const alternatives = buildRecoveryOptions(input).find((o) => o.kind === "alternatives")!;
    const applied = applyRecoveryOption(draft(), alternatives, library);
    const room = applied.items.find((item) => item.id === "i-room")!;

    expect(room.title).toBe("Skansen Room");
    expect(room.unitPriceMinor).toBe(80_000);
    expect(room.quantity).toBe(1);
  });

  test("a swap to a product that has vanished leaves the line alone", () => {
    const alternatives = buildRecoveryOptions(input).find((o) => o.kind === "alternatives")!;
    const applied = applyRecoveryOption(draft(), alternatives, []);

    expect(applied.items.find((item) => item.id === "i-room")?.title).toBe("Vasa Room");
  });
});

describe("alternatives stay like-for-like", () => {
  test("does not swap a lunch for something far cheaper of the same type", () => {
    // A welcome reception is food priced per person, but it is not a lunch.
    const reception: CatalogProduct = {
      productId: 6, variationId: 106, title: "Welcome reception", unit: "person",
      contentType: "food", unitPriceMinor: 1_500, vatRate: 0.12, currency: "EUR",
    };

    const options = buildRecoveryOptions({ ...input, library: [...library, reception] });
    const alternatives = options.find((option) => option.kind === "alternatives");
    const swaps = alternatives?.changes.filter((change) => change.type === "swap") ?? [];

    expect(swaps.some((swap) => swap.type === "swap" && swap.toVariationId === 106)).toBe(false);
  });

  test("still swaps to a comparable cheaper product", () => {
    const alternatives = buildRecoveryOptions(input).find((o) => o.kind === "alternatives")!;

    expect(
      alternatives.changes.some((change) => change.type === "swap" && change.toTitle === "Skansen Room"),
    ).toBe(true);
  });
});
