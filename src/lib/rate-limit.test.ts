import { describe, expect, test } from "bun:test";

import { clientKey, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  test("allows up to the limit, then refuses", () => {
    const check = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 0).allowed).toBe(false);
  });

  test("counts down the remaining allowance", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });

    expect(check("a", 0).remaining).toBe(1);
    expect(check("a", 0).remaining).toBe(0);
    expect(check("a", 0).remaining).toBe(0);
  });

  test("keys are independent", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 0).allowed).toBe(false);
    expect(check("b", 0).allowed).toBe(true);
  });

  test("the window reopens once it has passed", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 59_999).allowed).toBe(false);
    expect(check("a", 60_001).allowed).toBe(true);
  });

  test("reports seconds until the window resets", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });

    check("a", 0);
    expect(check("a", 30_000).retryAfter).toBe(30);
  });

  test("retryAfter is never zero, so a client always waits", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1_000 });

    check("a", 0);
    expect(check("a", 999).retryAfter).toBe(1);
  });
});

describe("clientKey", () => {
  test("takes the first address in x-forwarded-for", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip", () => {
    expect(clientKey(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  test("groups callers it cannot identify", () => {
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
