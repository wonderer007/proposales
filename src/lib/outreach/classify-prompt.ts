import { z } from "zod";

/**
 * The cadence classifier's contract and prompt (D17).
 *
 * Values-free and free of `server-only`, so the prompt wording and the output
 * schema can be unit tested; the model call itself lives in `classify.ts`.
 */

export const cadenceClassificationSchema = z.object({
  cadence: z.enum(["annual", "quarterly", "monthly", "one_off", "unknown"]),
  /** 0–1. Below 0.7 the result is never scheduled (see `effectiveCadence`). */
  confidence: z.number().min(0).max(1),
  /** One short line quoting what in the message implied it. */
  evidence: z.string().max(200),
});

export type CadenceClassification = z.infer<typeof cadenceClassificationSchema>;

export type ClassifierInput = {
  message: string;
  /** Event types from the working draft, where the agent has drafted one. */
  eventTypes: string[];
  /** ISO `YYYY-MM-DD` dates of the inquiry's events. */
  eventDates: string[];
};

export const SYSTEM_PROMPT = `You read a hotel event inquiry and judge how often that customer is likely to repeat the event.

Answer with one of:
- "annual" — happens once a year (kickoffs, Christmas parties, annual conferences, yearly board meetings)
- "quarterly" — happens roughly every three months (quarterly reviews, board meetings held four times a year)
- "monthly" — happens roughly every month (monthly team days, recurring workshops)
- "one_off" — a one-time occasion that will not repeat (weddings, birthdays, retirements, product launches, funerals)
- "unknown" — the message gives you nothing to go on

Rules:
- Judge only from what the message says. Do not assume a meeting repeats just because meetings often do.
- Wording like "annual", "yearly", "as every year", "again this year", "our usual", "quarterly", "each month" is strong evidence.
- A named recurring occasion (kickoff, Christmas dinner, quarterly review) is strong evidence even without those words.
- A one-time life event is "one_off" with high confidence. Being sure it will NOT repeat is just as useful as being sure it will.
- With nothing to go on, answer "unknown" with low confidence. Do not guess.
- Confidence is how sure you are, 0 to 1. Be honest: below 0.7 the answer is treated as unknown and never acted on.
- Evidence is one short line, quoting the words that decided it. If you answered "unknown", say what was missing.`;

/** The user-side prompt. Pure, so the wording can be unit tested. */
export function buildClassifierPrompt({
  message,
  eventTypes,
  eventDates,
}: ClassifierInput): string {
  const parts = [`Inquiry message:\n"""\n${message.trim()}\n"""`];

  if (eventTypes.length > 0) {
    parts.push(`Event types on this inquiry: ${[...new Set(eventTypes)].join(", ")}`);
  }
  if (eventDates.length > 0) {
    parts.push(`Event dates: ${[...new Set(eventDates)].sort().join(", ")}`);
  }

  return parts.join("\n\n");
}
