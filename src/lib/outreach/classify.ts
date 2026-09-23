import { generateObject } from "ai";
import { eq } from "drizzle-orm";

import { loadEnv } from "@/env.schema";
import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import type { Cadence } from "@/lib/db/schema";
import {
  SYSTEM_PROMPT,
  buildClassifierPrompt,
  cadenceClassificationSchema,
  type CadenceClassification,
  type ClassifierInput,
} from "./classify-prompt";

/**
 * Cadence classification for the outreach radar (D17).
 *
 * A plain `generateObject` call, deliberately outside the chat agent: it has no
 * tools, cannot reach a working draft, and reads only the inquiry's own text.
 * Each inquiry is classified once and never revisited — the message it reads
 * does not change.
 */

/**
 * Read through `loadEnv` rather than the `server-only` module, so scripts and
 * the eval runner can classify too — the same reason `db/client.ts` does.
 */
const env = loadEnv();

/** Classifies one inquiry. Throws if the model or the gateway fails. */
export async function classifyCadence(input: ClassifierInput): Promise<CadenceClassification> {
  const { object } = await generateObject({
    model: env.AI_MODEL,
    schema: cadenceClassificationSchema,
    system: SYSTEM_PROMPT,
    prompt: buildClassifierPrompt(input),
  });

  return object;
}

/** An inquiry waiting to be classified. */
export type Classifiable = ClassifierInput & { id: string };

export type ClassifyBatchResult = {
  classified: number;
  failed: number;
};

/**
 * How many inquiries one radar scan will classify, and how many at a time.
 *
 * Measured: 18 inquiries at concurrency 5 took ~21s, so a full batch of 30
 * would have been uncomfortably close to Vercel's 60s ceiling. 20 at
 * concurrency 8 is ~3 waves, which leaves room for a slow call — the classifier
 * takes 2s when the answer is obvious and 10s when it has to decide it cannot
 * tell.
 */
export const CLASSIFY_BATCH_LIMIT = 20;
export const CLASSIFY_CONCURRENCY = 8;

/**
 * Classifies up to `limit` inquiries and stores the results.
 *
 * Bounded on purpose: the scan runs inside a request, and Vercel gives it 60
 * seconds. A backlog larger than the limit is worked through over successive
 * scans rather than timing out on the first one.
 *
 * A single failure is swallowed — that inquiry stays unclassified and is
 * retried next scan, rather than taking the whole radar down with it.
 */
export async function classifyPending(
  pending: Classifiable[],
  { limit = CLASSIFY_BATCH_LIMIT, concurrency = CLASSIFY_CONCURRENCY } = {},
): Promise<ClassifyBatchResult> {
  const queue = pending.slice(0, limit);
  let classified = 0;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < queue.length) {
      const item = queue[next++];
      try {
        const result = await classifyCadence(item);
        await storeClassification(item.id, result);
        classified += 1;
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
  );

  return { classified, failed };
}

/** Writes a classification onto the inquiry. */
export async function storeClassification(
  inquiryId: string,
  { cadence, confidence, evidence }: CadenceClassification,
): Promise<void> {
  await db
    .update(inquiries)
    .set({
      cadence: cadence as Cadence,
      cadenceConfidence: confidence,
      cadenceEvidence: evidence,
      cadenceSource: "ai",
    })
    .where(eq(inquiries.id, inquiryId));
}

/**
 * Records the manager accepting the classifier's suggestion.
 *
 * Confidence goes to 1 and the source to `manager`, so `effectiveCadence` stops
 * applying the threshold to it.
 */
export async function acceptSuggestedCadence(
  inquiryId: string,
  cadence: Cadence,
): Promise<void> {
  await db
    .update(inquiries)
    .set({ cadence, cadenceConfidence: 1, cadenceSource: "manager" })
    .where(eq(inquiries.id, inquiryId));
}
