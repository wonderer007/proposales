import { describe, expect, test } from "bun:test";

import { parseEnv } from "@/env.schema";

const valid = {
  DATABASE_URL: "postgres://user:pass@host/db",
  PROPOSALES_API_KEY: "test-key",
  AI_GATEWAY_API_KEY: "gateway-key",
};

describe("parseEnv", () => {
  test("applies defaults for optional variables", () => {
    const env = parseEnv(valid);

    expect(env.PROPOSALES_API_BASE_URL).toBe("https://api.proposales.com");
    expect(env.AI_MODEL).toBe("anthropic/claude-sonnet-5");
    expect(env.NODE_ENV).toBe("development");
  });

  test("keeps explicit overrides", () => {
    const env = parseEnv({
      ...valid,
      PROPOSALES_API_BASE_URL: "https://staging.proposales.com",
      AI_MODEL: "anthropic/claude-opus-5",
    });

    expect(env.PROPOSALES_API_BASE_URL).toBe("https://staging.proposales.com");
    expect(env.AI_MODEL).toBe("anthropic/claude-opus-5");
  });

  test("fails fast and names every missing variable", () => {
    expect(() => parseEnv({})).toThrow(/Invalid environment variables/);

    try {
      parseEnv({});
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("PROPOSALES_API_KEY");
      expect(message).toContain("AI_GATEWAY_API_KEY");
    }
  });

  test("treats the company id as optional", () => {
    // Companies come from the API and are switched in the app; this only
    // picks a default, so a missing value must not fail the boot.
    expect(parseEnv(valid).PROPOSALES_COMPANY_ID).toBeUndefined();
    expect(parseEnv({ ...valid, PROPOSALES_COMPANY_ID: "5473" }).PROPOSALES_COMPANY_ID).toBe("5473");
  });

  test("rejects a malformed base URL", () => {
    expect(() => parseEnv({ ...valid, PROPOSALES_API_BASE_URL: "not-a-url" })).toThrow(
      /PROPOSALES_API_BASE_URL/,
    );
  });
});
