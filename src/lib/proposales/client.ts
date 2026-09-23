import { z } from "zod";

import { loadEnv } from "@/env.schema";
import {
  contentMutationResponseSchema,
  createRfpResponseSchema,
  errorResponseSchema,
  getProposalResponseSchema,
  listCompaniesResponseSchema,
  listTemplatesResponseSchema,
  listContentResponseSchema,
  proposalMutationResponseSchema,
  type Company,
  type CompanyTemplate,
  type ContentItem,
  type ContentMutationResponse,
  type CreateContentRequest,
  type CreateProposalRequest,
  type CreateProposalVersionRequest,
  type CreateRfpRequest,
  type Proposal,
  type ProposalMutationResponse,
  type UpdateProposalDraftRequest,
} from "./schemas";

/**
 * Server-only Proposales API client.
 *
 * Not guarded by `server-only` because `scripts/` imports it and runs outside
 * the React server condition. Nothing under `src/components` may import it —
 * the API key would leak into the browser bundle.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

/** A failed Proposales call, carrying the API's own `error.message`. */
export class ProposalesError extends Error {
  readonly status: number | null;
  readonly method: string;
  readonly path: string;
  /** Per-field validation issues, when the API returned any. */
  readonly issues: { code: string; path: (string | number)[]; message: string }[];

  constructor(
    message: string,
    options: {
      status?: number | null;
      method: string;
      path: string;
      issues?: { code: string; path: (string | number)[]; message: string }[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ProposalesError";
    this.status = options.status ?? null;
    this.method = options.method;
    this.path = options.path;
    this.issues = options.issues ?? [];
  }
}

type QueryValue = string | number | boolean | undefined;

type RequestOptions<T> = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  schema: z.ZodType<T>;
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Public endpoints (the inbox RFP) must not receive the API key. */
  authenticated?: boolean;
  timeoutMs?: number;
};

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function request<T>({
  method,
  path,
  schema,
  body,
  query,
  authenticated = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: RequestOptions<T>): Promise<T> {
  const env = loadEnv();
  const url = buildUrl(env.PROPOSALES_API_BASE_URL, path, query);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (authenticated) headers.Authorization = `Bearer ${env.PROPOSALES_API_KEY}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new ProposalesError(
      timedOut
        ? `Proposales did not respond within ${timeoutMs}ms`
        : `Could not reach Proposales: ${cause instanceof Error ? cause.message : String(cause)}`,
      { method, path, cause },
    );
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(payload);
    throw new ProposalesError(
      parsed.success
        ? parsed.data.error.message
        : `Proposales returned ${response.status} ${response.statusText}`.trim(),
      {
        status: response.status,
        method,
        path,
        issues: parsed.success ? (parsed.data.error.issues ?? []) : [],
      },
    );
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ProposalesError(
      `Unexpected response shape from ${method} ${path}: ${z.prettifyError(result.error)}`,
      { status: response.status, method, path, cause: result.error },
    );
  }

  return result.data;
}

// ---------------------------------------------------------------- companies

/** Every company the API key is an active member of. */
export async function listCompanies(): Promise<Company[]> {
  const { data } = await request({
    method: "GET",
    path: "/v3/companies",
    schema: listCompaniesResponseSchema,
  });

  return data;
}

/** Proposal templates a company has. We read them; we never create one. */
export async function listCompanyTemplates(companyId: number): Promise<CompanyTemplate[]> {
  const { data } = await request({
    method: "GET",
    path: `/v3/companies/${companyId}/templates`,
    schema: listTemplatesResponseSchema,
  });

  return data;
}

// ------------------------------------------------------------------ content

export type ListContentOptions = {
  companyId?: number;
  /** Narrow to specific variations; the API also returns richer detail then. */
  variationIds?: number[];
  productIds?: number[];
  includeArchived?: boolean;
};

/** Products and videos in the content library. */
export async function listContent(options: ListContentOptions = {}): Promise<ContentItem[]> {
  const { data } = await request({
    method: "GET",
    path: "/v3/content",
    schema: listContentResponseSchema,
    query: {
      company_id: options.companyId,
      variation_id: options.variationIds?.join(","),
      product_id: options.productIds?.join(","),
      include_archived: options.includeArchived,
    },
  });

  return data;
}

/** Creates one content item. Returns its product_id and variation_id. */
export async function createContent(
  body: CreateContentRequest,
): Promise<ContentMutationResponse["data"]> {
  const { data } = await request({
    method: "POST",
    path: "/v3/content",
    schema: contentMutationResponseSchema,
    body,
  });

  return data;
}

// ---------------------------------------------------------------------- RFP

/**
 * Creates an inbound request for proposal.
 *
 * This is a public endpoint keyed by the company's `inbox_token` (see
 * `Company.inbox_token`) and takes no API key, so the token is passed in
 * explicitly rather than read from the environment.
 */
export async function createRfp(
  inboxToken: string,
  body: CreateRfpRequest,
): Promise<{ id: number }> {
  return request({
    method: "POST",
    path: `/v1/inbox/${encodeURIComponent(inboxToken)}`,
    schema: createRfpResponseSchema,
    body,
    authenticated: false,
  });
}

// ----------------------------------------------------------------- proposals

/** Creates a new draft proposal. */
export async function createProposal(
  body: CreateProposalRequest,
): Promise<ProposalMutationResponse["proposal"]> {
  const { proposal } = await request({
    method: "POST",
    path: "/v3/proposals",
    schema: proposalMutationResponseSchema,
    body,
  });

  return proposal;
}

/**
 * Updates a draft in place, keeping the same UUID. `blocks`, when supplied,
 * replaces the entire ordered block list.
 */
export async function patchProposalDraft(
  uuid: string,
  body: UpdateProposalDraftRequest,
): Promise<ProposalMutationResponse["proposal"]> {
  const { proposal } = await request({
    method: "PATCH",
    path: `/v3/proposals/${encodeURIComponent(uuid)}`,
    schema: proposalMutationResponseSchema,
    body,
  });

  return proposal;
}

/**
 * Creates the next draft version in the same proposal series. Repeated calls
 * return the same draft until that draft is sent or archived, which makes the
 * call naturally idempotent.
 */
export async function createProposalVersion(
  uuid: string,
  body: CreateProposalVersionRequest,
): Promise<ProposalMutationResponse["proposal"]> {
  const { proposal } = await request({
    method: "POST",
    path: `/v3/proposals/${encodeURIComponent(uuid)}`,
    schema: proposalMutationResponseSchema,
    body,
  });

  return proposal;
}

/** Reads a proposal, used to refresh mirrored statuses. */
export async function getProposal(uuid: string): Promise<Proposal> {
  const { data } = await request({
    method: "GET",
    path: `/v3/proposals/${encodeURIComponent(uuid)}`,
    schema: getProposalResponseSchema,
  });

  return data;
}
