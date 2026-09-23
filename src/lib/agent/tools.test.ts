import { describe, expect, test } from "bun:test";

// The tools module reaches the database client, which validates the
// environment on import. `bun test` does not read .env.local, so stub the
// values before importing — nothing here connects to anything.
process.env.DATABASE_URL ??= "postgres://user:pass@localhost/db";
process.env.PROPOSALES_API_KEY ??= "test-key";
process.env.PROPOSALES_COMPANY_ID ??= "1";
process.env.AI_GATEWAY_API_KEY ??= "test-key";

const { createAgentTools } = await import("./tools");

const tools = createAgentTools("inq-1");
const names = Object.keys(tools);

describe("the agent's tool set", () => {
  test("exposes exactly the tools in SPEC §7.2", () => {
    expect(names.sort()).toEqual(
      [
        "addFlag",
        "addItem",
        "clearFlag",
        "getPricingPolicy",
        "getProposalHistory",
        "getRecoveryOptions",
        "getWorkingDraft",
        "listContentLibrary",
        "removeEvent",
        "recordRejection",
        "removeItem",
        "setBudget",
        "draftChangeNote",
        "setItemOptions",
        "setRequirements",
        "upsertEvent",
      ].sort(),
    );
  });

  test("has NO tool that creates, patches or versions a proposal", () => {
    // The manager's button is the only path to Proposales (SPEC §7.2, §6.4).
    // Reading is fine — `getProposalHistory` is in the spec — so the check is
    // on the action: anything touching a proposal must be a plain getter.
    const touchesProposals = /proposal|version/i;
    const readOnly = /^get/;

    const offenders = names.filter((name) => touchesProposals.test(name) && !readOnly.test(name));

    expect(offenders).toEqual([]);
  });

  test("anything that reads proposals is read-only", () => {
    for (const name of names.filter((candidate) => /proposal|version/i.test(candidate))) {
      const schema = (tools[name as keyof typeof tools] as {
        inputSchema?: { shape?: Record<string, unknown> };
      }).inputSchema;

      // A getter that takes no arguments cannot be steered into mutating.
      expect(`${name}:${Object.keys(schema?.shape ?? {}).join(",")}`).toBe(`${name}:`);
    }
  });

  test("no tool name pairs a mutating verb with a proposal", () => {
    const mutating = /^(create|patch|update|send|submit|publish|supersede|accept|reject)/i;

    expect(names.filter((name) => mutating.test(name) && /proposal|version/i.test(name))).toEqual([]);
  });

  test("no tool description offers to create a proposal", () => {
    for (const [name, definition] of Object.entries(tools)) {
      const description = (definition as { description?: string }).description ?? "";
      expect(`${name}: ${description}`).not.toMatch(/create a proposal|send the proposal/i);
    }
  });

  test("no tool takes an inquiry id — it comes from the route closure", () => {
    for (const [name, definition] of Object.entries(tools)) {
      const schema = (definition as { inputSchema?: { shape?: Record<string, unknown> } })
        .inputSchema;
      const keys = Object.keys(schema?.shape ?? {});

      expect(`${name}:${keys.join(",")}`).not.toMatch(/inquiryId/i);
    }
  });

  test("upsertEvent cannot set dateConfirmed", () => {
    const schema = (tools.upsertEvent as { inputSchema?: { shape?: Record<string, unknown> } })
      .inputSchema;

    expect(Object.keys(schema?.shape ?? {})).not.toContain("dateConfirmed");
  });

  test("addItem takes no quantity — the app computes it", () => {
    const schema = (tools.addItem as { inputSchema?: { shape?: Record<string, unknown> } })
      .inputSchema;

    expect(Object.keys(schema?.shape ?? {}).sort()).toEqual([
      "eventId",
      "note",
      "role",
      "variationId",
    ]);
  });

  test("draftChangeNote only writes text", () => {
    const schema = (tools.draftChangeNote as { inputSchema?: { shape?: Record<string, unknown> } })
      .inputSchema;

    expect(Object.keys(schema?.shape ?? {})).toEqual(["note"]);
  });

  test("setItemOptions demands an origin, so applying is never implicit", () => {
    const schema = (tools.setItemOptions as { inputSchema?: { shape?: Record<string, unknown> } })
      .inputSchema;

    expect(Object.keys(schema?.shape ?? {})).toContain("origin");
  });

  test("the agent cannot apply a discount or a policy override", () => {
    // Discounts stay with the manager (SPEC §6.6); the agent may only propose
    // one, and that tool arrives in D15.
    for (const [name, definition] of Object.entries(tools)) {
      const schema = (definition as { inputSchema?: { shape?: Record<string, unknown> } })
        .inputSchema;
      const keys = Object.keys(schema?.shape ?? {}).join(",");

      expect(`${name}:${keys}`).not.toMatch(/discount|policyOverride/i);
    }
  });

  test("the agent cannot pre-select an optional item for the customer", () => {
    const schema = (tools.setItemOptions as { inputSchema?: { shape?: Record<string, unknown> } })
      .inputSchema;

    expect(Object.keys(schema?.shape ?? {})).not.toContain("optionalPicked");
  });
});
