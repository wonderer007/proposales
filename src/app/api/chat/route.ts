import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";

import { env } from "@/env";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { parseDraft } from "@/lib/builder/draft";
import { getInquiryWithEvents, saveMessages } from "@/lib/db/queries";

export const maxDuration = 60;

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

  const result = streamText({
    model: env.AI_MODEL,
    system: buildSystemPrompt({
      inquiry,
      draft,
      today: new Date().toISOString().slice(0, 10),
    }),
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
