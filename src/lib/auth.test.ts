import { afterEach, describe, expect, test } from "bun:test";

import { demoPasscode, isAuthorised } from "./auth";

const original = process.env.DEMO_PASSCODE;

afterEach(() => {
  if (original === undefined) delete process.env.DEMO_PASSCODE;
  else process.env.DEMO_PASSCODE = original;
});

describe("demoPasscode", () => {
  test("is null when unset or blank, which switches the gate off", () => {
    delete process.env.DEMO_PASSCODE;
    expect(demoPasscode()).toBeNull();

    process.env.DEMO_PASSCODE = "   ";
    expect(demoPasscode()).toBeNull();
  });

  test("trims what it is given", () => {
    process.env.DEMO_PASSCODE = " 246810 ";
    expect(demoPasscode()).toBe("246810");
  });
});

describe("isAuthorised", () => {
  test("lets everyone through when no passcode is configured", () => {
    delete process.env.DEMO_PASSCODE;
    expect(isAuthorised(undefined)).toBe(true);
  });

  test("accepts the matching cookie only", () => {
    process.env.DEMO_PASSCODE = "246810";

    expect(isAuthorised("246810")).toBe(true);
    expect(isAuthorised("246811")).toBe(false);
    expect(isAuthorised("")).toBe(false);
    expect(isAuthorised(undefined)).toBe(false);
  });
});
