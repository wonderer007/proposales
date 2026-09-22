import { describe, expect, test } from "bun:test";

import { INQUIRY_STATUS_VARIANT, deriveInquiryStatus } from "./inquiry-status";

describe("deriveInquiryStatus", () => {
  test("an inquiry with no proposal is New", () => {
    expect(deriveInquiryStatus(null)).toBe("New");
    expect(deriveInquiryStatus(undefined)).toBe("New");
  });

  test("maps the Proposales statuses onto SPEC §4.1 names", () => {
    expect(deriveInquiryStatus("draft")).toBe("Draft");
    // Proposales has no "sent" — a proposal that has gone out is "active".
    expect(deriveInquiryStatus("active")).toBe("Sent");
    expect(deriveInquiryStatus("accepted")).toBe("Won");
    expect(deriveInquiryStatus("rejected")).toBe("Lost");
  });

  test("covers the statuses the spec does not name", () => {
    expect(deriveInquiryStatus("expired")).toBe("Expired");
    expect(deriveInquiryStatus("withdrawn")).toBe("Withdrawn");
    expect(deriveInquiryStatus("replaced")).toBe("Sent");
    expect(deriveInquiryStatus("template")).toBe("Draft");
  });

  test("falls back to New for an unknown status", () => {
    expect(deriveInquiryStatus("something-new")).toBe("New");
  });

  test("every status has badge styling", () => {
    for (const status of ["New", "Draft", "Sent", "Won", "Lost", "Expired", "Withdrawn"] as const) {
      expect(INQUIRY_STATUS_VARIANT[status]).toBeDefined();
    }
  });
});
