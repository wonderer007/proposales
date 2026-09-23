import { describe, expect, test } from "bun:test";

import {
  addItem,
  emptyDraft,
  setItemOptions,
  setRequirements,
  upsertEvent,
  type CatalogProduct,
} from "./draft";
import { buildBlock, buildDescription, buildTitle, toProposalRequest, type ProposalInquiry } from "./to-proposal";

const inquiry: ProposalInquiry = {
  id: "inq-1",
  contactName: "Anna Lindqvist",
  email: "anna@northstar.se",
  phone: "+46 70 123 45 67",
  companyName: "Northstar Consulting",
  rfpId: 125833,
};

const room: CatalogProduct = {
  productId: 1, variationId: 101, title: "Vasa Room", unit: "day",
  contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25, currency: "EUR",
};

const lunch: CatalogProduct = {
  productId: 2, variationId: 102, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

const meeting = {
  id: "e1", type: "meeting" as const, label: "Company meeting", date: "2026-10-14",
  startTime: "09:00", endTime: "12:00", headcount: 25, inferred: [],
};

const lunchEvent = {
  id: "e2", type: "lunch" as const, label: "lunch", date: "2026-10-14",
  startTime: "12:00", endTime: "13:00", headcount: 25, inferred: [],
};

function fullDraft() {
  let draft = upsertEvent(emptyDraft(), meeting);
  draft = upsertEvent(draft, lunchEvent);
  draft = addItem(draft, { id: "i1", eventId: "e1", product: room });

  return addItem(draft, { id: "i2", eventId: "e2", product: lunch });
}

describe("buildTitle", () => {
  test("says what the proposal is for, not what is in it", () => {
    expect(buildTitle(fullDraft(), inquiry)).toBe(
      "Company meeting for 25 guests, 14 October 2026 – Northstar Consulting",
    );
  });

  test("falls back to the contact when there is no company", () => {
    expect(buildTitle(fullDraft(), { ...inquiry, companyName: null })).toContain("– Anna Lindqvist");
  });

  test("spans a date range when the events run over several days", () => {
    let draft = upsertEvent(emptyDraft(), { ...meeting, date: "2026-11-18" });
    draft = upsertEvent(draft, { ...lunchEvent, date: "2026-11-20", headcount: 40 });

    expect(buildTitle(draft, inquiry)).toBe(
      "Lunch for 40 guests, 18–20 November 2026 – Northstar Consulting",
    );
  });

  test("takes the occasion from the largest event", () => {
    let draft = upsertEvent(emptyDraft(), { ...meeting, headcount: 20 });
    draft = upsertEvent(draft, { ...lunchEvent, label: "Gala dinner", headcount: 120 });

    expect(buildTitle(draft, inquiry)).toContain("Gala dinner for 120 guests");
  });

  test("degrades to something sensible with no events", () => {
    expect(buildTitle(emptyDraft(), inquiry)).toBe("Proposal – Northstar Consulting");
  });
});

describe("buildDescription", () => {
  test("greets by first name and lists the schedule with weekdays", () => {
    const description = buildDescription(fullDraft(), inquiry);

    expect(description).toContain("Dear Anna,");
    expect(description).toContain("- Company meeting, Wednesday, 14 October 2026, 09:00–12:00, 25 guests");
    expect(description).toContain("- lunch, Wednesday, 14 October 2026, 12:00–13:00, 25 guests");
  });

  test("lists unmatched requirements and omits matched ones", () => {
    const draft = setRequirements(fullDraft(), [
      { id: "r1", text: "Projector", status: "matched", itemId: "i1" },
      { id: "r2", text: "Vegan menu", status: "unmatched" },
    ]);

    const description = buildDescription(draft, inquiry);

    expect(description).toContain("Still to confirm");
    expect(description).toContain("- Vegan menu");
    expect(description).not.toContain("- Projector");
  });

  test("writes Swedish when the draft is Swedish", () => {
    const description = buildDescription({ ...fullDraft(), language: "sv" }, inquiry);

    expect(description).toContain("Hej Anna,");
    expect(description).toContain("25 gäster");
    expect(description).toContain("Program");
  });
});

describe("buildBlock", () => {
  test("uses the variation id as content_id and sends all four unit values", () => {
    const block = buildBlock({
      id: "i1", eventId: "e1", productId: 1, variationId: 101, title: "Vasa Room",
      unit: "day", contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25,
      currency: "EUR", quantity: 1, quantitySource: "computed",
      role: "core", optional: false, optionalPicked: false, quantityEditable: false,
      quantityMin: null, quantityMax: null, discount: null, policyOverride: null,
      choiceGroup: null, suggested: null,
    });

    expect(block).toEqual({
      type: "product-block",
      content_id: 101,
      quantity: 1,
      currency: "EUR",
      unit_value_without_discount_without_tax: 85_000,
      unit_value_with_discount_without_tax: 85_000,
      unit_value_without_discount_with_tax: 106_250,
      unit_value_with_discount_with_tax: 106_250,
      package_split: [
        { type: "meetingRoom", vat: 0.25, value_without_tax: 85_000, value_with_tax: 106_250 },
      ],
    });
  });

  test("rounds the tax-inclusive value to whole minor units", () => {
    const block = buildBlock({
      id: "i1", eventId: "e1", productId: 2, variationId: 102, title: "Coffee",
      unit: "person", contentType: "food", unitPriceMinor: 850, vatRate: 0.12,
      currency: "EUR", quantity: 25, quantitySource: "computed",
      role: "core", optional: false, optionalPicked: false, quantityEditable: false,
      quantityMin: null, quantityMax: null, discount: null, policyOverride: null,
      choiceGroup: null, suggested: null,
    });

    // 850 × 1.12 = 952
    expect(block.unit_value_with_discount_with_tax).toBe(952);
    expect(Number.isInteger(block.unit_value_with_discount_with_tax!)).toBe(true);
  });
});

describe("toProposalRequest", () => {
  test("maps the whole proposal", () => {
    const request = toProposalRequest(inquiry, fullDraft(), { companyId: 5473 });

    expect(request.company_id).toBe(5473);
    expect(request.language).toBe("en");
    expect(request.recipient).toEqual({
      first_name: "Anna",
      last_name: "Lindqvist",
      email: "anna@northstar.se",
      phone: "+46 70 123 45 67",
      company_name: "Northstar Consulting",
    });
    expect(request.blocks).toHaveLength(2);
    expect(request.blocks?.[0]?.content_id).toBe(101);
    expect(request.title_md).toBe(
      "Company meeting for 25 guests, 14 October 2026 – Northstar Consulting",
    );
  });

  test("links the proposal back to the RFP", () => {
    const request = toProposalRequest(inquiry, fullDraft(), { companyId: 5473 });

    expect(request.tracking).toEqual({ created_from_rfp: 125833 });
  });

  test("omits tracking when the inquiry never synced", () => {
    const request = toProposalRequest({ ...inquiry, rfpId: null }, fullDraft(), { companyId: 5473 });

    expect(request.tracking).toBeUndefined();
  });

  test("stores the inquiry id and events in data", () => {
    const request = toProposalRequest(inquiry, fullDraft(), { companyId: 5473 });

    expect(request.data?.inquiry_id).toBe("inq-1");
    expect(request.data?.events).toHaveLength(2);
  });

  test("omits optional recipient fields that are absent", () => {
    const request = toProposalRequest(
      { ...inquiry, phone: null, companyName: null },
      fullDraft(),
      { companyId: 5473 },
    );

    expect(request.recipient).toEqual({
      first_name: "Anna", last_name: "Lindqvist", email: "anna@northstar.se",
    });
  });
});

describe("buildBlock with optional and flexible settings", () => {
  const item = {
    id: "i1", eventId: "e1", productId: 2, variationId: 102, title: "Lunch buffet",
    unit: "person" as const, contentType: "food" as const, unitPriceMinor: 3_200,
    vatRate: 0.12, currency: "EUR", quantity: 25, quantitySource: "computed" as const,
    role: "core" as const, optional: false, optionalPicked: false,
    quantityEditable: false, quantityMin: null, quantityMax: null,
    discount: null, policyOverride: null, choiceGroup: null, suggested: null,
  };

  test("sends nothing extra for a plain committed item", () => {
    const block = buildBlock(item);

    expect(block.optional).toBeUndefined();
    expect(block.quantity_editable).toBeUndefined();
    expect(block.quantity_min).toBeUndefined();
    expect(block.comment).toBeUndefined();
  });

  test("maps an optional item", () => {
    const block = buildBlock({ ...item, optional: true, optionalPicked: true });

    expect(block.optional).toBe(true);
    expect(block.optional_picked).toBe(true);
  });

  test("maps flexible quantity, and makes it visible", () => {
    const block = buildBlock({
      ...item, quantityEditable: true, quantityMin: 12, quantityMax: 16,
    });

    expect(block).toMatchObject({
      quantity_editable: true, quantity_visible: true, quantity_min: 12, quantity_max: 16,
    });
  });

  test("omits a bound that is not set", () => {
    const block = buildBlock({ ...item, quantityEditable: true, quantityMax: 40 });

    expect(block.quantity_min).toBeUndefined();
    expect(block.quantity_max).toBe(40);
  });

  test("passes the recipient-facing comment through", () => {
    expect(buildBlock({ ...item, comment: "Adjust as you like" }).comment).toBe("Adjust as you like");
  });

  test("maps a discount without pre-reducing the unit values", () => {
    const percent = buildBlock({ ...item, discount: { type: "percent", value: 0.1 } });

    expect(percent.percent_discount).toBe(0.1);
    expect(percent.fixed_discount).toBeUndefined();
    // Proposales applies the reduction, so the unit values stay undiscounted.
    expect(percent.unit_value_with_discount_without_tax).toBe(3_200);

    const fixed = buildBlock({ ...item, discount: { type: "fixed", value: 5_000 } });
    expect(fixed.fixed_discount).toBe(5_000);
    expect(fixed.percent_discount).toBeUndefined();
  });
});

describe("description explains the arrangements", () => {
  const skansen: CatalogProduct = {
    productId: 9, variationId: 109, title: "Skansen Room", unit: "day",
    contentType: "meetingRoom", unitPriceMinor: 80_000, vatRate: 0.25, currency: "EUR",
  };
  const bedroom: CatalogProduct = {
    productId: 10, variationId: 110, title: "Standard double room", unit: "night",
    contentType: "accommodation", unitPriceMinor: 18_500, vatRate: 0.12, currency: "EUR",
  };
  const spa: CatalogProduct = {
    productId: 11, variationId: 111, title: "Spa access", unit: "person",
    contentType: "other", unitPriceMinor: 4_000, vatRate: 0.25, currency: "EUR",
  };

  function bigMeeting() {
    // 120 guests seated across two rooms — the case that looks like a mistake
    // on a bare block list.
    let draft = upsertEvent(emptyDraft(), { ...meeting, headcount: 120 });
    draft = addItem(draft, { id: "r1", eventId: "e1", product: room });

    return addItem(draft, { id: "r2", eventId: "e1", product: skansen });
  }

  test("says why two rooms are booked for one event", () => {
    const description = buildDescription(bigMeeting(), inquiry);

    expect(description).toContain("How we have arranged it");
    expect(description).toContain(
      "2 rooms are reserved so all 120 guests are seated together: Vasa Room, Skansen Room.",
    );
  });

  test("stays quiet when one room seats everyone", () => {
    const draft = addItem(upsertEvent(emptyDraft(), meeting), {
      id: "r1", eventId: "e1", product: room,
    });

    expect(buildDescription(draft, inquiry)).not.toContain("How we have arranged it");
  });

  test("mentions overnight accommodation", () => {
    const draft = addItem(bigMeeting(), { id: "b1", eventId: "e1", product: bedroom });

    expect(buildDescription(draft, inquiry)).toContain(
      "Overnight accommodation is included: Standard double room.",
    );
  });

  test("names value-added services as optional extras", () => {
    let draft = addItem(bigMeeting(), { id: "s1", eventId: "e1", product: spa, role: "addon" });
    draft = setItemOptions(draft, "s1", { comment: "Bookable per guest" });

    const description = buildDescription(draft, inquiry);

    expect(description).toContain("Optional extras");
    expect(description).toContain("Yours to include or leave out");
    expect(description).toContain("- Spa access — Bookable per guest");
  });

  test("omits the extras section when everything is core", () => {
    expect(buildDescription(bigMeeting(), inquiry)).not.toContain("Optional extras");
  });

  test("writes the arrangements in Swedish too", () => {
    const description = buildDescription({ ...bigMeeting(), language: "sv" }, inquiry);

    expect(description).toContain("Så har vi lagt upp det");
    expect(description).toContain("alla 120 gäster");
  });
});

describe("a multi-day event does not repeat itself", () => {
  const skansenRoom: CatalogProduct = {
    productId: 9, variationId: 109, title: "Skansen Room", unit: "day",
    contentType: "meetingRoom", unitPriceMinor: 80_000, vatRate: 0.25, currency: "EUR",
  };
  const pa: CatalogProduct = {
    productId: 12, variationId: 112, title: "PA system", unit: "unit",
    contentType: "other", unitPriceMinor: 9_500, vatRate: 0.25, currency: "EUR",
  };

  /** Two days of the same conference: same rooms, same extra, on each day. */
  function twoDays() {
    let draft = emptyDraft();

    for (const [id, date] of [
      ["d1", "2026-11-18"],
      ["d2", "2026-11-19"],
    ] as const) {
      draft = upsertEvent(draft, {
        id, type: "conference", label: "Annual conference", date,
        startTime: "09:00", endTime: "17:00", headcount: 100, inferred: [],
      });
      draft = addItem(draft, { id: `${id}-a`, eventId: id, product: room });
      draft = addItem(draft, { id: `${id}-b`, eventId: id, product: skansenRoom });
      draft = addItem(draft, { id: `${id}-pa`, eventId: id, product: pa, role: "addon" });
    }

    return draft;
  }

  function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
  }

  test("states a shared room arrangement once, as 'each day'", () => {
    const description = buildDescription(twoDays(), inquiry);

    expect(occurrences(description, "rooms are reserved")).toBe(1);
    expect(description).toContain(
      "Each day, 2 rooms are reserved so all 100 guests are seated together: Vasa Room, Skansen Room.",
    );
  });

  test("lists an extra booked on every day only once", () => {
    expect(occurrences(buildDescription(twoDays(), inquiry), "- PA system")).toBe(1);
  });

  test("still distinguishes days whose arrangements differ", () => {
    const board: CatalogProduct = {
      ...skansenRoom, productId: 13, variationId: 113, title: "Board Room", unitPriceMinor: 45_000,
    };

    let draft = twoDays();
    // Day two moves to different rooms for a smaller group.
    draft = { ...draft, items: draft.items.filter((item) => !item.id.startsWith("d2-")) };
    draft = upsertEvent(draft, {
      id: "d2", type: "meeting", label: "Workshop day", date: "2026-11-19",
      startTime: "09:00", endTime: "13:00", headcount: 40, inferred: [],
    });
    draft = addItem(draft, { id: "d2-a", eventId: "d2", product: room });
    draft = addItem(draft, { id: "d2-b", eventId: "d2", product: board });

    const description = buildDescription(draft, inquiry);

    expect(occurrences(description, "rooms are reserved")).toBe(2);
    expect(description).toContain("Workshop day, Thursday, 19 November 2026: 2 rooms");
    expect(description).toContain("all 40 guests");
  });

  test("keeps a single-day proposal phrased plainly", () => {
    let draft = upsertEvent(emptyDraft(), { ...meeting, headcount: 100 });
    draft = addItem(draft, { id: "a", eventId: "e1", product: room });
    draft = addItem(draft, { id: "b", eventId: "e1", product: skansenRoom });

    const description = buildDescription(draft, inquiry);

    expect(description).toContain("2 rooms are reserved");
    expect(description).not.toContain("Each day");
    // One arrangement needs no date prefix.
    expect(description).not.toContain("Company meeting, Wednesday, 14 October 2026: 2 rooms");
  });
});
