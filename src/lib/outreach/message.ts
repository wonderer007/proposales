import { generateText } from "ai";

import { loadEnv } from "@/env.schema";
import {
  MESSAGE_SYSTEM_PROMPT,
  buildMessageContext,
  buildMessagePrompt,
} from "./message-prompt";
import type { MessageContext } from "./message-prompt";
import type { Lead } from "./types";

/**
 * Drafts the outreach message (D17).
 *
 * A plain `generateText` call outside the chat agent: no tools, no access to a
 * working draft, and nothing it returns is ever sent anywhere by itself. The
 * manager reads, edits and sends it.
 */

const env = loadEnv();

export async function draftMessage(context: MessageContext): Promise<string> {
  const { text } = await generateText({
    model: env.AI_MODEL,
    system: MESSAGE_SYSTEM_PROMPT,
    prompt: buildMessagePrompt(context),
    // Enough headroom for 120 words plus the model's own line breaks.
    maxOutputTokens: 400,
  });

  return text.trim();
}

/** Drafts the message for a lead. */
export function draftMessageForLead(lead: Lead): Promise<string> {
  return draftMessage(buildMessageContext(lead));
}
