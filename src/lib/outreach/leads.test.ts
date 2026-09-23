import { describe, expect, test } from "bun:test";

import { addDays } from "./cadence";
import { customerKey, evaluateCustomer, findLeads, groupByCustomer, outcomeSegment } from "./leads";
import type { HistoryInquiry, HistoryProposal, OutreachContact } from "./types";

/**
 * Detection is pure, so every test states `today` and the range explicitly.
 * The scenario throughout is the one in the acceptance criteria: today is
 * 2026-10-05, the radar window is 2026-10-01 → 2026-12-01.
 */

const TODAY = "2026-10-05";
const FROM = "2026-10-01";
const TO = "2026-12-01";

function proposal(overrides: Partial<HistoryProposal> = {}): HistoryProposal {
  return {
    version: 1,
    status: "accepted",
    valueMinor: 250_000,
    currency: "EUR",
    rejectionReason: null,
    createdAt: "2025-11-01T10:00:00.000Z",
    ...overrides,
  };
}

function inquiry(overrides: Partial<HistoryInquiry> = {}): HistoryInquiry {
  return {
    id: "inq-1",
    contactName: "Anna Lindqvist",
    email: "anna@northstar.se",
    companyName: "Northstar Consulting",
    phone: null,
    language: "en",
    message: "Our annual kickoff again, same as last year.",
    createdAt: "2025-10-01T10:00:00.000Z",
    cadence: "annual",
    cadenceConfidence: 0.9,
    cadenceEvidence: '"annual kickoff"',
    cadenceSource: "ai",
    events: [{ date: "2025-12-20", endDate: null, type: "conference" }],
    proposals: [proposal()],
    status: "Won",
    ...overrides,
  };
}

describe("customerKey", () => {
  test("is the lowercased, trimmed email", () => {
    expect(customerKey("  Anna@Northstar.SE ", "Northstar")).toBe("anna@northstar.se");
  });

  test("falls back to the company name when there is no email", () => {
    expect(customerKey(null, "Northstar Consulting")).toBe("northstar consulting");
  });

  test("is empty when there is neither", () => {
    expect(customerKey(null, null)).toBe("");
  });
});

describe("groupByCustomer", () => {
  test("groups inquiries that share an email, newest first", () => {
    const [customer] = groupByCustomer(
      [
        inquiry({ id: "old", createdAt: "2024-10-01T10:00:00.000Z" }),
        inquiry({ id: "new", createdAt: "2025-10-01T10:00:00.000Z" }),
      ],
      TODAY,
    );

    expect(customer.inquiries.map((i) => i.id)).toEqual(["new", "old"]);
  });

  test("the most recent inquiry decides the cadence", () => {
    const [customer] = groupByCustomer(
      [
        inquiry({ id: "old", createdAt: "2024-10-01T10:00:00.000Z", cadence: "quarterly" }),
        inquiry({ id: "new", createdAt: "2025-10-01T10:00:00.000Z", cadence: "annual" }),
      ],
      TODAY,
    );

    expect(customer.cadence).toBe("annual");
  });

  test("the last event is the most recent one that has already happened", () => {
    const [customer] = groupByCustomer(
      [
        inquiry({
          events: [
            { date: "2024-12-12", endDate: null, type: "conference" },
            { date: "2025-12-12", endDate: null, type: "conference" },
            // Already on the books for next year — not the pattern-setting event.
            { date: "2026-12-12", endDate: null, type: "conference" },
          ],
        }),
      ],
      TODAY,
    );

    expect(customer.lastEvent?.date).toBe("2025-12-12");
  });

  test("ignores an inquiry with no usable key", () => {
    expect(groupByCustomer([inquiry({ email: "", companyName: null })], TODAY)).toHaveLength(0);
  });
});

describe("outcomeSegment", () => {
  test("the most recent proposal decides", () => {
    expect(
      outcomeSegment([
        inquiry({
          proposals: [
            proposal({ status: "accepted", createdAt: "2024-01-01T00:00:00.000Z" }),
            proposal({ status: "rejected", createdAt: "2025-01-01T00:00:00.000Z" }),
          ],
        }),
      ]),
    ).toBe("rejected");
  });

  test("an unanswered proposal reads as quoted, not as never quoted", () => {
    expect(outcomeSegment([inquiry({ proposals: [proposal({ status: "active" })] })])).toBe(
      "quoted",
    );
    expect(outcomeSegment([inquiry({ proposals: [proposal({ status: "draft" })] })])).toBe(
      "quoted",
    );
  });

  test("a later unanswered proposal outranks an earlier acceptance", () => {
    expect(
      outcomeSegment([
        inquiry({
          proposals: [
            proposal({ status: "accepted", createdAt: "2024-01-01T00:00:00.000Z" }),
            proposal({ status: "active", createdAt: "2025-01-01T00:00:00.000Z" }),
          ],
        }),
      ]),
    ).toBe("quoted");
  });

  test("no proposal at all is never quoted", () => {
    expect(outcomeSegment([inquiry({ proposals: [] })])).toBe("no_proposal");
  });
});

describe("findLeads", () => {
  function run(inquiries: HistoryInquiry[], contacts: OutreachContact[] = []) {
    return findLeads({ inquiries, contacts, today: TODAY, from: FROM, to: TO });
  }

  test("an annual customer is scheduled 75 days before the expected date", () => {
    const { leads } = run([inquiry()]);

    expect(leads).toHaveLength(1);
    expect(leads[0].nextExpectedDate).toBe("2026-12-20");
    expect(leads[0].recommendedContactDate).toBe("2026-10-06");
    expect(leads[0].customer.outcome).toBe("accepted");
  });

  test("the reasoning names the cadence, the last event and the lead time", () => {
    const { leads } = run([inquiry()]);

    expect(leads[0].reasoning).toContain("annual conference");
    expect(leads[0].reasoning).toContain("75 days ahead");
  });

  test("a one-off never appears", () => {
    const { leads, skipped } = run([inquiry({ cadence: "one_off", cadenceConfidence: 0.95 })]);

    expect(leads).toHaveLength(0);
    expect(skipped[0].reason).toBe("cadence_not_schedulable");
  });

  test("an unsure classification never appears", () => {
    const { leads, skipped } = run([inquiry({ cadence: "annual", cadenceConfidence: 0.4 })]);

    expect(leads).toHaveLength(0);
    expect(skipped[0].reason).toBe("cadence_not_schedulable");
  });

  test("an unclassified inquiry never appears", () => {
    const { skipped } = run([inquiry({ cadence: null, cadenceConfidence: null })]);

    expect(skipped[0].reason).toBe("cadence_not_schedulable");
  });

  test("a customer with no past event never appears", () => {
    const { skipped } = run([
      inquiry({ events: [{ date: "2027-01-01", endDate: null, type: "conference" }] }),
    ]);

    expect(skipped[0].reason).toBe("no_past_event");
  });

  test("any inquiry near the expected date suppresses the lead", () => {
    const { leads, skipped } = run([
      inquiry(),
      inquiry({
        id: "already-booking",
        createdAt: "2025-09-01T10:00:00.000Z",
        status: "Sent",
        events: [{ date: "2026-12-28", endDate: null, type: "conference" }],
        proposals: [],
      }),
    ]);

    expect(leads).toHaveLength(0);
    expect(skipped[0].reason).toBe("existing_inquiry");
  });

  test("an inquiry outside the 14-day window does not suppress it", () => {
    const { leads } = run([
      inquiry(),
      inquiry({
        id: "unrelated",
        createdAt: "2025-09-01T10:00:00.000Z",
        status: "Sent",
        events: [{ date: "2027-01-10", endDate: null, type: "conference" }],
        proposals: [],
      }),
    ]);

    expect(leads).toHaveLength(1);
  });

  test("a settled inquiry near the expected date suppresses it too", () => {
    const { leads, skipped } = run([
      inquiry(),
      inquiry({
        id: "settled",
        createdAt: "2025-09-01T10:00:00.000Z",
        status: "Rejected",
        events: [{ date: "2026-12-28", endDate: null, type: "conference" }],
        proposals: [],
      }),
    ]);

    expect(leads).toHaveLength(0);
    expect(skipped[0].reason).toBe("existing_inquiry");
  });

  test("contact within the last 90 days hides the lead", () => {
    const { leads, skipped } = run(
      [inquiry()],
      [
        {
          customerKey: "anna@northstar.se",
          nextExpectedDate: "2026-12-20",
          createdAt: `${addDays(TODAY, -89)}T10:00:00.000Z`,
        },
      ],
    );

    expect(leads).toHaveLength(0);
    expect(skipped[0].reason).toBe("recently_contacted");
  });

  test("the cooldown expires on day 90", () => {
    const { leads } = run(
      [inquiry()],
      [
        {
          customerKey: "anna@northstar.se",
          nextExpectedDate: "2026-12-20",
          createdAt: `${addDays(TODAY, -91)}T10:00:00.000Z`,
        },
      ],
    );

    expect(leads).toHaveLength(1);
  });

  test("another customer's outreach is ignored", () => {
    const { leads } = run(
      [inquiry()],
      [
        {
          customerKey: "someone@else.se",
          nextExpectedDate: "2026-12-20",
          createdAt: "2026-10-02T10:00:00.000Z",
        },
      ],
    );

    expect(leads).toHaveLength(1);
  });

  test("sorts by recommended contact date", () => {
    const { leads } = findLeads({
      inquiries: [
        inquiry({ id: "late", email: "late@x.se", events: [{ date: "2025-12-20", endDate: null, type: "conference" }] }),
        inquiry({ id: "early", email: "early@x.se", events: [{ date: "2025-11-01", endDate: null, type: "conference" }] }),
      ],
      contacts: [],
      today: TODAY,
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(leads.map((lead) => lead.customer.email)).toEqual(["early@x.se", "late@x.se"]);
  });
});

describe("range filtering", () => {
  /** An annual event whose recommended contact date lands exactly on `contactOn`. */
  function customerContactedOn(contactOn: string): HistoryInquiry {
    const lastEvent = addDays(contactOn, 75 - 365);
    return inquiry({ events: [{ date: lastEvent, endDate: null, type: "conference" }] });
  }

  function leadsFor(contactOn: string, from: string, to: string) {
    return findLeads({
      inquiries: [customerContactedOn(contactOn)],
      contacts: [],
      today: TODAY,
      from,
      to,
    }).leads;
  }

  test("included on the first day of the range", () => {
    expect(leadsFor(FROM, FROM, TO)).toHaveLength(1);
  });

  test("included on the last day of the range", () => {
    expect(leadsFor(TO, FROM, TO)).toHaveLength(1);
  });

  test("excluded the day before the range", () => {
    expect(leadsFor(addDays(FROM, -1), FROM, TO)).toHaveLength(0);
  });

  test("excluded the day after the range", () => {
    expect(leadsFor(addDays(TO, 1), FROM, TO)).toHaveLength(0);
  });
});

describe("evaluateCustomer", () => {
  test("reports the range as the reason when everything else passes", () => {
    const [customer] = groupByCustomer([inquiry()], TODAY);
    const result = evaluateCustomer(customer, [], TODAY, "2027-01-01", "2027-02-01");

    expect(result).toEqual({ reason: "outside_range" });
  });
});
