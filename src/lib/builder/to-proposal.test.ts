import { describe, expect, test } from "bun:test";

import { addItem, emptyDraft, setRequirements, upsertEvent, type CatalogProduct } from "./draft";
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
  test("names the events and the company", () => {
    expect(buildTitle(fullDraft(), inquiry)).toBe("Company meeting with lunch – Northstar Consulting");
  });

  test("falls back to the contact when there is no company", () => {
    expect(buildTitle(fullDraft(), { ...inquiry, companyName: null })).toBe(
      "Company meeting with lunch – Anna Lindqvist",
    );
  });

  test("handles a single event", () => {
    const draft = addItem(upsertEvent(emptyDraft(), meeting), { id: "i1", eventId: "e1", product: room });

    expect(buildTitle(draft, inquiry)).toBe("Company meeting – Northstar Consulting");
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
    expect(request.title_md).toBe("Company meeting with lunch – Northstar Consulting");
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
