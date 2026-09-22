import { asc, eq, sql } from "drizzle-orm";
import type { UIMessage } from "ai";

import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import type { MessageRole } from "@/lib/db/schema";

/** Chat history for one inquiry, oldest first. */
export async function getMessages(inquiryId: string): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.inquiryId, inquiryId))
    .orderBy(asc(messages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: row.parts as UIMessage["parts"],
  }));
}

/**
 * Persists the conversation after a response finishes.
 *
 * Upserts on the AI SDK's message id, so re-saving a turn (or a regenerate)
 * updates that message rather than duplicating it.
 */
export async function saveMessages(inquiryId: string, list: UIMessage[]): Promise<void> {
  // A message without an id cannot be upserted safely — it would collide with
  // every other id-less row on the primary key.
  const usable = list.filter((message) => message.id);
  if (usable.length === 0) return;

  const rows = usable.map((message) => ({
    id: message.id,
    inquiryId,
    role: message.role as MessageRole,
    parts: message.parts,
  }));

  await db
    .insert(messages)
    .values(rows)
    .onConflictDoUpdate({
      target: messages.id,
      set: { parts: sqlExcluded("parts") },
    });
}

/** `excluded.<column>` — the row Postgres tried to insert. */
function sqlExcluded(column: "parts") {
  return sql`excluded.${sql.identifier(column)}`;
}

