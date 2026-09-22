import { beforeEach, describe, expect, test } from "bun:test";

import { clearDraftLocks, withDraftLock } from "./draft-lock";

beforeEach(clearDraftLocks);

describe("withDraftLock", () => {
  test("serialises concurrent read-modify-write cycles on one inquiry", async () => {
    // Stands in for the stored draft: each operation reads it, waits, writes back.
    let stored: string[] = [];

    const append = (value: string) =>
      withDraftLock("inq-1", async () => {
        const snapshot = stored;
        await new Promise((resolve) => setTimeout(resolve, 5));
        stored = [...snapshot, value];
      });

    await Promise.all([append("a"), append("b"), append("c")]);

    // Without the lock each call would read the same empty snapshot and the
    // last writer would win, leaving a single entry.
    expect(stored).toEqual(["a", "b", "c"]);
  });

  test("different inquiries do not block each other", async () => {
    const order: string[] = [];

    await Promise.all([
      withDraftLock("inq-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("slow");
      }),
      withDraftLock("inq-2", async () => {
        order.push("fast");
      }),
    ]);

    expect(order).toEqual(["fast", "slow"]);
  });

  test("a failed operation does not wedge the queue", async () => {
    const failed = withDraftLock("inq-1", async () => {
      throw new Error("boom");
    });

    await expect(failed).rejects.toThrow("boom");

    expect(await withDraftLock("inq-1", async () => "still works")).toBe("still works");
  });

  test("returns the operation's value", async () => {
    expect(await withDraftLock("inq-1", async () => 42)).toBe(42);
  });
});
