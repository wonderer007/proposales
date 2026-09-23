import { describe, expect, test } from "bun:test";

import {
  buildMessageContext,
  buildMessagePrompt,
  checkMessage,
  describeHistory,
  wordCount,
} from "./message-prompt";
import { groupByCustomer } from "./leads";
import type { HistoryInquiry, Lead } from "./types";

const TODAY = "2026-10-05";

function inquiry(overrides: Partial<HistoryInquiry> = {}): HistoryInquiry {
  return {
    id: "inq-1",
    contactName: "Johan Persson",
    email: "johan@perssonteknik.se",
    companyName: "Persson Teknik AB",
    phone: null,
    language: "en",
    message: "Our annual kickoff again.",
    createdAt: "2025-10-01T10:00:00.000Z",
    cadence: "annual",
    cadenceConfidence: 0.95,
    cadenceEvidence: '"annual kickoff"',
    cadenceSource: "ai",
    events: [{ date: "2025-12-20", endDate: null, type: "conference" }],
    proposals: [
      {
        version: 1,
        status: "accepted",
        valueMinor: 277_000,
        currency: "EUR",
        rejectionReason: null,
        createdAt: "2025-10-02T10:00:00.000Z",
      },
    ],
    status: "Won",
    ...overrides,
  };
}

function leadFor(inquiries: HistoryInquiry[]): Lead {
  const [customer] = groupByCustomer(inquiries, TODAY);
  return {
    customer,
    sourceInquiryId: customer.inquiries[0].id,
    nextExpectedDate: "2026-12-20",
    recommendedContactDate: "2026-10-06",
    reasoning: "annual conference…",
  };
}

describe("describeHistory", () => {
  test("reads oldest first, naming the event and the outcome", () => {
    const lines = describeHistory(
      groupByCustomer(
        [
          inquiry({ id: "old", createdAt: "2024-10-01T10:00:00.000Z" }),
          inquiry({ id: "new", createdAt: "2025-10-01T10:00:00.000Z" }),
        ],
        TODAY,
      )[0],
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("conference");
    expect(lines[0]).toContain("they accepted the proposal");
  });

  test("says when no proposal was ever sent", () => {
    const lines = describeHistory(groupByCustomer([inquiry({ proposals: [] })], TODAY)[0]);
    expect(lines[0]).toContain("no proposal was ever sent");
  });

  test("says when a proposal went unanswered", () => {
    const lines = describeHistory(
      groupByCustomer(
        [inquiry({ proposals: [{ ...inquiry().proposals[0], status: "active" }] })],
        TODAY,
      )[0],
    );

    expect(lines[0]).toContain("never answered");
  });
});

describe("buildMessageContext", () => {
  test("carries the customer's language", () => {
    const context = buildMessageContext(leadFor([inquiry({ language: "sv" })]));
    expect(context.language).toBe("sv");
  });

  test("picks up the most recent rejection reason", () => {
    const context = buildMessageContext(
      leadFor([
        inquiry({
          proposals: [
            {
              version: 1, status: "rejected", valueMinor: 1, currency: "EUR",
              rejectionReason: "Too expensive", createdAt: "2025-01-01T00:00:00.000Z",
            },
          ],
        }),
      ]),
    );

    expect(context.rejectionReason).toBe("Too expensive");
  });
});

describe("buildMessagePrompt", () => {
  test("names the language and the recipient", () => {
    const prompt = buildMessagePrompt(buildMessageContext(leadFor([inquiry()])));

    expect(prompt).toContain("Johan Persson");
    expect(prompt).toContain("Persson Teknik AB");
    expect(prompt).toContain("English");
  });

  test("asks for the expected date as a question, not an assertion", () => {
    const prompt = buildMessagePrompt(buildMessageContext(leadFor([inquiry()])));

    expect(prompt).toContain("do not assert it");
    expect(prompt).toContain("20 Dec 2026");
  });

  test("uses the warm-return angle for an accepted customer", () => {
    const prompt = buildMessagePrompt(buildMessageContext(leadFor([inquiry()])));
    expect(prompt).toContain("warm return");
  });

  test("uses the acknowledge-the-reason angle for a rejected one", () => {
    const prompt = buildMessagePrompt(
      buildMessageContext(
        leadFor([
          inquiry({
            proposals: [
              {
                version: 1, status: "rejected", valueMinor: 1, currency: "EUR",
                rejectionReason: "Too expensive", createdAt: "2025-01-01T00:00:00.000Z",
              },
            ],
          }),
        ]),
      ),
    );

    expect(prompt).toContain("Acknowledge the reason");
    expect(prompt).toContain("Too expensive");
  });

  test("does not press an unanswered customer about the silence", () => {
    const prompt = buildMessagePrompt(
      buildMessageContext(
        leadFor([inquiry({ proposals: [{ ...inquiry().proposals[0], status: "active" }] })]),
      ),
    );

    expect(prompt).toContain("Do not press them about the silence");
  });
});

describe("checkMessage", () => {
  test("passes a clean message", () => {
    expect(
      checkMessage(
        "Hi Johan, we were glad to host your kickoff last December. Are you planning it again " +
          "around the same time this year? Happy to put something together.",
      ),
    ).toEqual([]);
  });

  test("flags a currency amount", () => {
    expect(checkMessage("We can do it for 1 490 EUR again.")[0].rule).toBe("price");
    expect(checkMessage("It would be €1,490 this year.")[0].rule).toBe("price");
    expect(checkMessage("Runt 14 000 kr som förra året.")[0].rule).toBe("price");
  });

  test("flags an offer of money off, with or without a figure", () => {
    expect(checkMessage("We could offer a discount this time.")[0].rule).toBe("price");
    expect(checkMessage("We can do a reduced rate.")[0].rule).toBe("price");
    expect(checkMessage("It would be 32 EUR per person.")[0].rule).toBe("price");
  });

  test("does not flag the customer's own rejection reason quoted back", () => {
    // The rejected angle asks the model to acknowledge the reason, so this
    // exact sentence is the one we want — not one to warn about.
    expect(
      checkMessage(
        "I know the day rate came in above what the board had approved, which is understandable.",
      ),
    ).toEqual([]);
  });

  test("flags a claim about availability", () => {
    expect(checkMessage("The Vasa Room is available that week.")[0].rule).toBe("availability");
    expect(checkMessage("We have reserved the date for you.")[0].rule).toBe("availability");
  });

  test("a plain date is not a price", () => {
    expect(checkMessage("Are you planning it around 20 December 2026?")).toEqual([]);
  });
});

describe("wordCount", () => {
  test("counts words, not characters", () => {
    expect(wordCount("  one two   three  ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
