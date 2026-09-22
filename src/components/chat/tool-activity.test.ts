import { describe, expect, test } from "bun:test";

import { describeToolCall, toolActivity } from "./tool-activity";

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

describe("in-flight calls", () => {
  test("reads in the present tense while running", () => {
    expect(describeToolCall({ type: "tool-addItem", input: {} }, false)).toBe("Adding a product");
    expect(describeToolCall({ type: "tool-listContentLibrary", input: { type: "food" } }, false)).toBe(
      "Looking up food products",
    );
    expect(describeToolCall({ type: "tool-upsertEvent", input: {} }, false)).toBe("Adding an event");
    expect(describeToolCall({ type: "tool-upsertEvent", input: { id: "e1" } }, false)).toBe(
      "Updating an event",
    );
  });
});

describe("toolActivity", () => {
  test("includes running calls so the chat never goes quiet", () => {
    const message = {
      id: "m1",
      role: "assistant" as const,
      parts: [
        {
          type: "tool-listContentLibrary",
          state: "output-available",
          input: {},
          output: { items: [] },
        },
        { type: "tool-addItem", state: "input-available", input: { variationId: 1 } },
      ],
    };

    expect(toolActivity(message as never)).toEqual([
      { text: "Looked up the content library", done: true },
      { text: "Adding a product", done: false },
    ]);
  });

  test("ignores non-tool parts", () => {
    const message = { id: "m1", role: "assistant" as const, parts: [{ type: "text", text: "hi" }] };

    expect(toolActivity(message as never)).toEqual([]);
  });
});
