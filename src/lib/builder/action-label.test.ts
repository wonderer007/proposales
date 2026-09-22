import { describe, expect, test } from "bun:test";

import { proposalAction, proposalActionLabel } from "./action-label";

describe("proposalAction", () => {
  test("no active proposal means create", () => {
    expect(proposalAction(null)).toBe("create");
    expect(proposalAction(undefined)).toBe("create");
  });

  test("an unsent draft is patched in place", () => {
    expect(proposalAction("draft")).toBe("patch");
    expect(proposalAction("template")).toBe("patch");
  });

  test("anything the customer has seen becomes a new version", () => {
    for (const status of ["active", "accepted", "rejected", "expired", "withdrawn", "replaced"]) {
      expect(proposalAction(status)).toBe("version");
    }
  });
});

describe("proposalActionLabel", () => {
  test("matches the labels in the spec", () => {
    expect(proposalActionLabel("create")).toBe("Create proposal");
    expect(proposalActionLabel("patch")).toBe("Update draft");
    expect(proposalActionLabel("version")).toBe("Create new version");
  });
});
