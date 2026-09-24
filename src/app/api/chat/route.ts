import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { z } from "zod";

import { env } from "@/env";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { createAgentTools } from "@/lib/agent/tools";
import { parseDraft } from "@/lib/builder/draft";
import { getActiveProposal, getInquiryWithEvents, saveMessages } from "@/lib/db/queries";
import { describeSelections, type RecipientSelections } from "@/lib/proposals/selections";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

export const maxDuration = 60;

/**
 * A cap on the chat endpoint.
 *
 * This is the only route that spends model tokens per request, and the app is
 * an open demo, so an unattended client or a scraper could run up the AI
 * Gateway bill unchecked. 20 turns a minute is far above what a manager working
 * through one inquiry needs. Per instance only — see `src/lib/rate-limit.ts`.
 */
const checkRateLimit = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * The inquiry assistant.
 *
 * The inquiry id comes from the request body but is verified against the
 * database here — the chat is always scoped to an inquiry that exists, and in
 * D10 the tools take that id from this closure rather than from the model.
 */
const requestSchema = z.object({
  inquiryId: z.uuid(),
  messages: z.array(z.unknown()),
});

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request.headers));

  if (!rate.allowed) {
    return Response.json(
      { error: "Too many messages. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: "Malformed chat request" }, { status: 400 });
  }

  const { inquiryId } = parsed.data;
  const messages = parsed.data.messages as UIMessage[];

  const inquiry = await getInquiryWithEvents(inquiryId);
  if (!inquiry) {
    return Response.json({ error: "Inquiry not found" }, { status: 404 });
  }

  const draft = parseDraft(inquiry.workingDraft, inquiry.language);
  const active = await getActiveProposal(inquiryId);

  const result = streamText({
    model: env.AI_MODEL,
    system: buildSystemPrompt({
      inquiry,
      draft,
      today: new Date().toISOString().slice(0, 10),
      activeProposal: active
        ? {
            version: active.version,
            status: active.status,
            snapshot: active.snapshot,
            recipientSelections: describeSelections(
              (active.recipientSelections as RecipientSelections | null) ?? null,
            ),
          }
        : null,
    }),
    // Scoped to this inquiry by closure; the model never supplies the id.
    tools: createAgentTools(inquiryId),
    // Enough steps to look up the library, build several events and reply,
    // but bounded so a confused loop cannot run away.
    stopWhen: stepCountIs(12),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    // Persistence mode: onFinish receives the user turn and the reply together.
    originalMessages: messages,
    // Without this the reply is saved with an empty id, so the next one
    // overwrites it on the messages primary key.
    generateMessageId: () => crypto.randomUUID(),
    onFinish: ({ messages: all }) => saveMessages(inquiryId, all),
    onError: (error) =>
      error instanceof Error ? error.message : "The assistant could not respond.",
  });
}
