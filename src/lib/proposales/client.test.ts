import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  ProposalesError,
  createProposal,
  createProposalVersion,
  createRfp,
  getProposal,
  listCompanies,
  listContent,
  patchProposalDraft,
} from "./client";

const realFetch = globalThis.fetch;

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function mockFetch(status: number, payload: unknown) {
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return new Response(payload === undefined ? "" : JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function lastCall(): Call {
  const call = calls.at(-1);
  if (!call) throw new Error("fetch was never called");
  return call;
}

beforeEach(() => {
  calls = [];
  process.env.DATABASE_URL = "postgres://user:pass@host/db";
  process.env.PROPOSALES_API_KEY = "test-key";
  process.env.PROPOSALES_COMPANY_ID = "42";
  process.env.PROPOSALES_API_BASE_URL = "https://api.proposales.com";
  process.env.AI_GATEWAY_API_KEY = "gateway-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("request plumbing", () => {
  test("sends bearer auth and parses the response", async () => {
    mockFetch(200, {
      data: [
        {
          id: 42,
          name: "Grand Hotel",
          currency: "SEK",
          timezone: "Europe/Stockholm",
          inbox_token: "tok_abc",
          created_at: 1,
        },
      ],
    });

    const companies = await listCompanies();

    expect(companies).toEqual([
      {
        id: 42,
        name: "Grand Hotel",
        currency: "SEK",
        timezone: "Europe/Stockholm",
        inbox_token: "tok_abc",
      },
    ]);

    const { url, init } = lastCall();
    expect(url).toBe("https://api.proposales.com/v3/companies");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  test("keeps only the fields we read", async () => {
    mockFetch(200, {
      data: [
        {
          product_id: 1,
          variation_id: 2,
          title: { en: "Board Room" },
          description: { en: "Seats 12" },
          created_at: 1700000000,
          integration_id: null,
          sources: { oracle: { code: "X" } },
        },
      ],
    });

    const [item] = await listContent({ companyId: 42 });

    expect(item).toEqual({
      product_id: 1,
      variation_id: 2,
      title: { en: "Board Room" },
      description: { en: "Seats 12" },
    });
    expect(lastCall().url).toBe("https://api.proposales.com/v3/content?company_id=42");
  });

  test("serializes id filters as comma-separated query params", async () => {
    mockFetch(200, { data: [] });

    await listContent({ variationIds: [789, 101112], includeArchived: true });

    const url = new URL(lastCall().url);
    expect(url.searchParams.get("variation_id")).toBe("789,101112");
    expect(url.searchParams.get("include_archived")).toBe("true");
    expect(url.searchParams.has("product_id")).toBe(false);
  });
});

describe("error mapping", () => {
  test("surfaces the API's error.message and issues", async () => {
    mockFetch(400, {
      error: {
        message: "company_id is required",
        issues: [{ code: "invalid_type", path: ["company_id"], message: "Required" }],
      },
    });

    const error = (await createProposal({ company_id: 1, language: "en" }).catch(
      (e: unknown) => e,
    )) as ProposalesError;

    expect(error).toBeInstanceOf(ProposalesError);
    expect(error.message).toBe("company_id is required");
    expect(error.status).toBe(400);
    expect(error.method).toBe("POST");
    expect(error.path).toBe("/v3/proposals");
    expect(error.issues).toHaveLength(1);
    expect(error.issues[0]?.path).toEqual(["company_id"]);
  });

  test("falls back to the status line when the body is not an error envelope", async () => {
    mockFetch(500, "<html>nope</html>");

    const error = (await getProposal("abc").catch((e: unknown) => e)) as ProposalesError;

    expect(error).toBeInstanceOf(ProposalesError);
    expect(error.message).toContain("500");
    expect(error.status).toBe(500);
  });

  test("reports a schema mismatch instead of returning bad data", async () => {
    mockFetch(200, { data: { uuid: "abc", status: "nonsense", language: "en" } });

    const error = (await getProposal("abc").catch((e: unknown) => e)) as ProposalesError;

    expect(error).toBeInstanceOf(ProposalesError);
    expect(error.message).toContain("Unexpected response shape from GET /v3/proposals/abc");
    expect(error.message).toContain("status");
  });
});

describe("endpoints", () => {
  test("createRfp posts to the public inbox without the API key", async () => {
    mockFetch(200, { id: 987 });

    const result = await createRfp("tok_abc", {
      email: "anna@example.com",
      message: "Meeting for 25",
      silent_confirmation: "1",
    });

    expect(result).toEqual({ id: 987 });

    const { url, init } = lastCall();
    expect(url).toBe("https://api.proposales.com/v1/inbox/tok_abc");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({
      email: "anna@example.com",
      message: "Meeting for 25",
      silent_confirmation: "1",
    });
  });

  test("createProposal returns the uuid and url", async () => {
    mockFetch(200, {
      proposal: { uuid: "p-uuid", url: "https://app.proposales.com/p/p-uuid" },
    });

    const proposal = await createProposal({
      company_id: 42,
      language: "en",
      blocks: [{ type: "product-block", content_id: 2, quantity: 25 }],
    });

    expect(proposal).toEqual({ uuid: "p-uuid", url: "https://app.proposales.com/p/p-uuid" });
    expect(JSON.parse(String(lastCall().init.body)).blocks[0]).toEqual({
      type: "product-block",
      content_id: 2,
      quantity: 25,
    });
  });

  test("patchProposalDraft PATCHes the same uuid", async () => {
    mockFetch(200, { proposal: { uuid: "p-uuid", url: "https://example.com/p" } });

    await patchProposalDraft("p-uuid", { company_id: 42, title_md: "Updated" });

    const { url, init } = lastCall();
    expect(init.method).toBe("PATCH");
    expect(url).toBe("https://api.proposales.com/v3/proposals/p-uuid");
  });

  test("createProposalVersion POSTs to the existing uuid", async () => {
    mockFetch(200, { proposal: { uuid: "p-uuid-v2", url: "https://example.com/p2" } });

    const proposal = await createProposalVersion("p-uuid", { company_id: 42, language: "en" });

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(url).toBe("https://api.proposales.com/v3/proposals/p-uuid");
    expect(proposal.uuid).toBe("p-uuid-v2");
  });

  test("getProposal reads status and version", async () => {
    mockFetch(200, {
      data: {
        uuid: "p-uuid",
        status: "active",
        version: 2,
        language: "en",
        currency: "SEK",
        value_without_tax: 125000,
        company_id: 42,
        data: {},
        blocks: [],
        attachments: [],
      },
    });

    const proposal = await getProposal("p-uuid");

    expect(proposal.status).toBe("active");
    expect(proposal.version).toBe(2);
    expect(proposal.value_without_tax).toBe(125000);
  });

  test("accepts a null status", async () => {
    mockFetch(200, { data: { uuid: "p-uuid", status: null, language: "en" } });

    expect((await getProposal("p-uuid")).status).toBeNull();
  });
});
