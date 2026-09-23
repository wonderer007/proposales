import { describe, expect, test } from "bun:test";

import { buildClassifierPrompt, cadenceClassificationSchema } from "./classify-prompt";

/**
 * Only the pure parts are tested here: the prompt text and the output contract.
 * The model call itself is exercised by the seeded radar scan, not by a unit
 * test — an assertion on a live LLM would be flaky by construction.
 */

describe("buildClassifierPrompt", () => {
  test("includes the message verbatim", () => {
    const prompt = buildClassifierPrompt({
      message: "  Our annual kickoff again.  ",
      eventTypes: [],
      eventDates: [],
    });

    expect(prompt).toContain("Our annual kickoff again.");
  });

  test("lists event types and dates when they are known", () => {
    const prompt = buildClassifierPrompt({
      message: "Same as last year please.",
      eventTypes: ["conference", "dinner"],
      eventDates: ["2025-12-20"],
    });

    expect(prompt).toContain("conference, dinner");
    expect(prompt).toContain("2025-12-20");
  });

  test("omits the extra sections for an inquiry the agent never drafted", () => {
    const prompt = buildClassifierPrompt({
      message: "Hello, do you have space in December?",
      eventTypes: [],
      eventDates: [],
    });

    expect(prompt).not.toContain("Event types");
    expect(prompt).not.toContain("Event dates");
  });

  test("de-duplicates repeated types and sorts dates", () => {
    const prompt = buildClassifierPrompt({
      message: "Two days.",
      eventTypes: ["meeting", "meeting", "lunch"],
      eventDates: ["2026-03-02", "2026-03-01"],
    });

    expect(prompt).toContain("meeting, lunch");
    expect(prompt).toContain("2026-03-01, 2026-03-02");
  });
});

describe("cadenceClassificationSchema", () => {
  test("accepts a well-formed classification", () => {
    const parsed = cadenceClassificationSchema.parse({
      cadence: "annual",
      confidence: 0.92,
      evidence: '"our annual kickoff"',
    });

    expect(parsed.cadence).toBe("annual");
  });

  test("rejects a cadence outside the enum", () => {
    expect(() =>
      cadenceClassificationSchema.parse({ cadence: "weekly", confidence: 1, evidence: "x" }),
    ).toThrow();
  });

  test("rejects a confidence outside 0–1", () => {
    expect(() =>
      cadenceClassificationSchema.parse({ cadence: "annual", confidence: 1.4, evidence: "x" }),
    ).toThrow();
  });
});
