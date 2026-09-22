import { describe, expect, test } from "bun:test";

import { detectLanguage, newInquirySchema } from "./schema";

const valid = {
  contactName: "Anna Lindqvist",
  email: "anna@example.com",
  phone: "",
  companyName: "",
  message: "We would like a meeting room for 25 people.",
  range: { startDate: "2026-10-14", endDate: "2026-10-14", startTime: "09:00", endTime: "16:00" },
};

describe("newInquirySchema", () => {
  test("accepts a valid inquiry", () => {
    expect(newInquirySchema.safeParse(valid).success).toBe(true);
  });

  test("rejects an end time before the start time on a single day", () => {
    const result = newInquirySchema.safeParse({
      ...valid,
      range: { ...valid.range, startTime: "16:00", endTime: "09:00" },
    });

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path.join(".") === "range.endTime");
    expect(issue?.message).toBe("End time must be after the start time");
  });

  test("rejects an end time equal to the start time on a single day", () => {
    const result = newInquirySchema.safeParse({
      ...valid,
      range: { ...valid.range, startTime: "09:00", endTime: "09:00" },
    });

    expect(result.success).toBe(false);
  });

  test("allows an earlier end time when the range spans days", () => {
    const result = newInquirySchema.safeParse({
      ...valid,
      range: {
        startDate: "2026-10-14",
        endDate: "2026-10-16",
        startTime: "16:00",
        endTime: "09:00",
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects an end date before the start date", () => {
    const result = newInquirySchema.safeParse({
      ...valid,
      range: { ...valid.range, startDate: "2026-10-14", endDate: "2026-10-10" },
    });

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path.join(".") === "range.endDate");
    expect(issue?.message).toBe("The end date cannot be before the start date");
  });

  test("requires a date", () => {
    const result = newInquirySchema.safeParse({
      ...valid,
      range: { ...valid.range, startDate: "", endDate: "" },
    });

    expect(result.success).toBe(false);
  });

  test("requires a contact name, email and message", () => {
    for (const field of ["contactName", "email", "message"] as const) {
      const result = newInquirySchema.safeParse({ ...valid, [field]: "" });
      expect(result.success).toBe(false);
    }
  });

  test("rejects a malformed email", () => {
    expect(newInquirySchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  test("accepts a multi-day range", () => {
    const result = newInquirySchema.safeParse({
      ...valid,
      range: {
        startDate: "2026-11-05",
        endDate: "2026-11-07",
        startTime: "09:00",
        endTime: "13:00",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("detectLanguage", () => {
  test("detects Swedish from å and ä", () => {
    expect(detectLanguage("Vi planerar en julmiddag för 30 personer")).toBe("sv");
    expect(detectLanguage("Kan ni skicka en offert? Tack så mycket!")).toBe("sv");
  });

  test("detects Swedish from common words without special characters", () => {
    expect(detectLanguage("Hej! Vi vill boka ett rum.")).toBe("sv");
  });

  test("defaults to English", () => {
    expect(detectLanguage("We would like to book a meeting room for 25 people.")).toBe("en");
    expect(detectLanguage("")).toBe("en");
  });

  test("does not call German Swedish on an ö alone", () => {
    expect(detectLanguage("Booking for Mr Schröder, 12 guests")).toBe("en");
  });
});
