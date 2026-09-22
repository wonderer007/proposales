import { describe, expect, test } from "bun:test";

import { splitName, toIsoInstant, toRfpRequest } from "./rfp";

const inquiry = {
  contactName: "Anna Lindqvist",
  email: "anna@example.com",
  phone: "+46 70 123 45 67",
  companyName: "Northstar Consulting",
  message: "Quarterly meeting for 25 people.",
  language: "en" as const,
};

const events = [
  { date: "2026-11-05", endDate: null, startTime: "09:00:00", endTime: "13:00:00", position: 0 },
];

describe("splitName", () => {
  test("splits a two-part name", () => {
    expect(splitName("Anna Lindqvist")).toEqual({ first_name: "Anna", last_name: "Lindqvist" });
  });

  test("keeps middle names with the first name", () => {
    expect(splitName("Jan Olof Svensson")).toEqual({
      first_name: "Jan Olof",
      last_name: "Svensson",
    });
  });

  test("handles a single name", () => {
    expect(splitName("Madonna")).toEqual({ first_name: "Madonna" });
  });
});

describe("toIsoInstant", () => {
  test("combines date and time as UTC", () => {
    expect(toIsoInstant("2026-10-14", "09:00")).toBe("2026-10-14T09:00:00.000Z");
  });

  test("tolerates the HH:mm:ss Postgres returns", () => {
    expect(toIsoInstant("2026-10-14", "16:30:00")).toBe("2026-10-14T16:30:00.000Z");
  });

  test("returns null for malformed input", () => {
    expect(toIsoInstant("14/10/2026", "09:00")).toBeNull();
  });
});

describe("toRfpRequest", () => {
  test("maps the inquiry onto the API body", () => {
    expect(toRfpRequest(inquiry, events)).toEqual({
      email: "anna@example.com",
      first_name: "Anna",
      last_name: "Lindqvist",
      message: "Quarterly meeting for 25 people.",
      language: "en",
      silent_confirmation: "1",
      phone_number: "+46 70 123 45 67",
      company_name: "Northstar Consulting",
      start_date: "2026-11-05T09:00:00.000Z",
      end_date: "2026-11-05T13:00:00.000Z",
    });
  });

  test("a multi-day range ends on its end date", () => {
    const body = toRfpRequest(inquiry, [
      { date: "2026-12-01", endDate: "2026-12-03", startTime: "09:00", endTime: "17:00", position: 0 },
    ]);

    expect(body.start_date).toBe("2026-12-01T09:00:00.000Z");
    expect(body.end_date).toBe("2026-12-03T17:00:00.000Z");
  });

  test("a single-day range ends on its start date", () => {
    const body = toRfpRequest(inquiry, [
      { date: "2026-12-01", endDate: null, startTime: "09:00", endTime: "17:00", position: 0 },
    ]);

    expect(body.start_date).toBe("2026-12-01T09:00:00.000Z");
    expect(body.end_date).toBe("2026-12-01T17:00:00.000Z");
  });

  test("omits optional fields that are absent", () => {
    const body = toRfpRequest({ ...inquiry, phone: null, companyName: null }, []);

    expect(body.phone_number).toBeUndefined();
    expect(body.company_name).toBeUndefined();
    expect(body.start_date).toBeUndefined();
    expect(body.end_date).toBeUndefined();
  });

  test("always suppresses the confirmation email", () => {
    expect(toRfpRequest(inquiry, events).silent_confirmation).toBe("1");
  });
});
