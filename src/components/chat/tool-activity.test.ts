import { describe, expect, test } from "bun:test";

import { describeToolCall } from "./tool-activity";

describe("describeToolCall", () => {
  test("names an added product with its quantity", () => {
    const line = describeToolCall({
      type: "tool-addItem",
      state: "output-available",
      input: { eventId: "e1", variationId: 189240 },
      output: { items: [{ id: "i1", title: "Lunch buffet", quantity: 50 }] },
    });

    expect(line).toBe("Added Lunch buffet × 50");
  });

  test("describes a created and an updated event", () => {
    expect(
      describeToolCall({ type: "tool-upsertEvent", input: { label: "Lunch", headcount: 50 } }),
    ).toBe("Added event: Lunch · 50 guests");

    expect(
      describeToolCall({ type: "tool-upsertEvent", input: { id: "e1", label: "Lunch" } }),
    ).toBe("Updated event: Lunch");
  });

  test("reports a rejected variation id rather than a bare success", () => {
    const line = describeToolCall({
      type: "tool-addItem",
      input: { variationId: 999 },
      output: { error: "No product with variationId 999" },
    });

    expect(line).toBe("Tried to add a product that is not in the library");
  });

  test("counts requirements", () => {
    expect(
      describeToolCall({
        type: "tool-setRequirements",
        input: { requirements: [{ text: "Projector" }, { text: "Vegan" }] },
      }),
    ).toBe("Recorded 2 requirements");

    expect(
      describeToolCall({ type: "tool-setRequirements", input: { requirements: [{ text: "X" }] } }),
    ).toBe("Recorded 1 requirement");
  });

  test("mentions the filter when the library is narrowed", () => {
    expect(describeToolCall({ type: "tool-listContentLibrary", input: { type: "food" } })).toBe(
      "Looked up food products",
    );
    expect(describeToolCall({ type: "tool-listContentLibrary", input: {} })).toBe(
      "Looked up the content library",
    );
  });

  test("ignores parts that are not tool calls", () => {
    expect(describeToolCall({ type: "text" })).toBeNull();
  });
});
