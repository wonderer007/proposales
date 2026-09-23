/**
 * Runs the agent's first turn against each fixture and checks what it produced.
 *
 *   bun run scripts/eval.ts                 # all fixtures
 *   bun run scripts/eval.ts 04 09           # only fixtures whose id contains these
 *
 * Uses the live content library but never touches the database: each fixture
 * gets an in-memory draft store, so nothing is read from or written to any
 * inquiry.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateText, stepCountIs } from "ai";
import { z } from "zod";

import { loadEnv } from "@/env.schema";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { createAgentTools, memoryDraftStore } from "@/lib/agent/tools";
import { emptyDraft, type WorkingDraft } from "@/lib/builder/draft";
import { getContentLibrary } from "@/lib/content/library";
import type { InquiryWithEvents } from "@/lib/db/queries";

const FIXTURE_DIR = "evals/fixtures";
const RESULTS_FILE = "evals/results.md";
const FIRST_TURN = "What should we offer for this inquiry?";

const fixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  today: z.string(),
  /** Overrides the default opening message, for instruction-following cases. */
  firstTurn: z.string().optional(),
  inquiry: z.object({
    contactName: z.string(),
    email: z.string(),
    companyName: z.string().nullish(),
    phone: z.string().nullish(),
    language: z.enum(["en", "sv"]),
    message: z.string(),
    events: z.array(
      z.object({
        date: z.string(),
        endDate: z.string().nullish(),
        startTime: z.string(),
        endTime: z.string(),
      }),
    ),
  }),
  expect: z.object({
    eventCount: z.number().int().optional(),
    minEventCount: z.number().int().optional(),
    eventTypes: z.array(z.string()).optional(),
    mustIncludeTypes: z.array(z.string()).optional(),
    headcounts: z.array(z.number().int()).optional(),
    allHeadcounts: z.number().int().optional(),
    allDates: z.string().optional(),
    dates: z.array(z.string().nullable()).optional(),
    asksForMissingInfo: z.boolean().optional(),
    neverInventsADate: z.boolean().optional(),
    addsItems: z.boolean().optional(),
    hasUnmatchedRequirement: z.boolean().optional(),
    mentionsRoomChoice: z.boolean().optional(),
    repliesInSwedish: z.boolean().optional(),
    recordsBudget: z.boolean().optional(),
    resolvesRelativeDate: z.object({ weekday: z.number(), notBefore: z.string() }).optional(),
    headcountIsEstimated: z.boolean().optional(),
    recommendsFlexibleQuantity: z.boolean().optional(),
    suggestionsNotApplied: z.boolean().optional(),
    addonsOptionalOrUnmatched: z.boolean().optional(),
    noPendingSuggestions: z.boolean().optional(),
    neverExceedsDiscountPolicy: z.boolean().optional(),
    proposesNothing: z.boolean().optional(),
    appliedDirectly: z
      .object({
        optionalTitleContains: z.string(),
        flexibleTitleContains: z.string(),
        flexibleMin: z.number(),
        flexibleMax: z.number(),
      })
      .optional(),
  }),
});

type Fixture = z.infer<typeof fixtureSchema>;
type Check = { name: string; passed: boolean; detail?: string };

function toInquiry(fixture: Fixture): InquiryWithEvents {
  return {
    id: `eval-${fixture.id}`,
    contactName: fixture.inquiry.contactName,
    email: fixture.inquiry.email,
    phone: fixture.inquiry.phone ?? null,
    companyName: fixture.inquiry.companyName ?? null,
    message: fixture.inquiry.message,
    language: fixture.inquiry.language,
    rfpId: null,
    rfpSyncError: null,
    workingDraft: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    events: fixture.inquiry.events.map((event, position) => ({
      id: `evt-${position}`,
      inquiryId: `eval-${fixture.id}`,
      date: event.date,
      endDate: event.endDate ?? null,
      startTime: event.startTime,
      endTime: event.endTime,
      position,
    })),
  } as unknown as InquiryWithEvents;
}

const QUESTION_MARKERS =
  /\?|please (tell|ask|confirm|let me know|provide)|could you|can you|i need|i can'?t guess|missing|not (been )?(given|specified)|saknas|vilket datum|vilken dag/i;

/** Phrases that count as handing the decision back to the manager. */
const OFFERS_CHOICE =
  /which|choose|choice|prefer|option|pick|between|let me know|alternativ|välj|vilken/i;

function check(name: string, passed: boolean, detail?: string): Check {
  return { name, passed, ...(detail ? { detail } : {}) };
}

function evaluate(
  fixture: Fixture,
  draft: WorkingDraft,
  reply: string,
  knownVariationIds: Set<number>,
): Check[] {
  const expected = fixture.expect;
  const checks: Check[] = [];
  const types = draft.events.map((event) => event.type);

  // The rule that must never break: the agent cannot invent a product.
  const invented = draft.items.filter((item) => !knownVariationIds.has(item.variationId));
  checks.push(
    check(
      "no invented product ids",
      invented.length === 0,
      invented.map((item) => `${item.title}#${item.variationId}`).join(", "),
    ),
  );

  if (expected.eventCount !== undefined) {
    checks.push(
      check(
        `events = ${expected.eventCount}`,
        draft.events.length === expected.eventCount,
        `got ${draft.events.length}`,
      ),
    );
  }

  if (expected.minEventCount !== undefined) {
    checks.push(
      check(
        `events >= ${expected.minEventCount}`,
        draft.events.length >= expected.minEventCount,
        `got ${draft.events.length}`,
      ),
    );
  }

  if (expected.eventTypes) {
    const wanted = [...expected.eventTypes].sort();
    const got = [...types].sort();
    checks.push(
      check(`types = ${wanted.join("+")}`, JSON.stringify(wanted) === JSON.stringify(got), got.join("+")),
    );
  }

  if (expected.mustIncludeTypes) {
    const missing = expected.mustIncludeTypes.filter((type) => !types.includes(type as never));
    checks.push(check(`includes ${expected.mustIncludeTypes.join("+")}`, missing.length === 0, types.join("+")));
  }

  if (expected.headcounts) {
    const got = draft.events.map((event) => event.headcount);
    const wanted = [...expected.headcounts].sort((a, b) => a - b);
    const sorted = [...got].sort((a, b) => (a ?? 0) - (b ?? 0));
    checks.push(
      check(
        `headcounts = ${wanted.join(",")}`,
        JSON.stringify(wanted) === JSON.stringify(sorted),
        got.join(","),
      ),
    );
  }

  if (expected.allHeadcounts !== undefined) {
    const got = draft.events.map((event) => event.headcount);
    checks.push(
      check(
        `every event has ${expected.allHeadcounts} guests`,
        got.length > 0 && got.every((value) => value === expected.allHeadcounts),
        got.join(","),
      ),
    );
  }

  if (expected.allDates !== undefined) {
    const got = draft.events.map((event) => event.date);
    checks.push(
      check(
        `every event is on ${expected.allDates}`,
        got.length > 0 && got.every((value) => value === expected.allDates),
        got.map((d) => d ?? "null").join(","),
      ),
    );
  }

  if (expected.dates) {
    const got = draft.events.map((event) => event.date);
    const wanted = [...expected.dates].sort();
    checks.push(
      check(
        `dates = ${wanted.map((d) => d ?? "null").join(",")}`,
        JSON.stringify(wanted) === JSON.stringify([...got].sort()),
        got.map((d) => d ?? "null").join(","),
      ),
    );
  }

  if (expected.asksForMissingInfo !== undefined) {
    const asked = QUESTION_MARKERS.test(reply);
    checks.push(
      check(
        expected.asksForMissingInfo ? "asks for missing info" : "does not need to ask",
        expected.asksForMissingInfo ? asked : true,
      ),
    );
  }

  if (expected.neverInventsADate) {
    const invented = draft.events.filter((event) => event.date !== null);
    checks.push(
      check(
        "never invents a date",
        invented.length === 0,
        invented.map((event) => event.date).join(","),
      ),
    );
  }

  if (expected.addsItems) {
    // Both outcomes satisfy the spec: shortlist something, or — when several
    // products fit — present the options and ask the manager to choose
    // (SPEC §7.3 rule 8). Refusing to pick is not a failure.
    const offeredChoice = OFFERS_CHOICE.test(reply);
    checks.push(
      check(
        "shortlists products or offers a choice",
        draft.items.length > 0 || offeredChoice,
        `${draft.items.length} items`,
      ),
    );
  }

  if (expected.hasUnmatchedRequirement) {
    const unmatched = draft.requirements.filter((r) => r.status === "unmatched");
    checks.push(
      check("records an unmatched requirement", unmatched.length > 0, unmatched.map((r) => r.text).join("; ")),
    );
  }

  if (expected.mentionsRoomChoice) {
    // Either it offered a choice in prose, or it left the room out pending one.
    checks.push(check("offers a room choice", OFFERS_CHOICE.test(reply)));
  }

  if (expected.repliesInSwedish) {
    checks.push(check("replies in Swedish", /[åäö]|hej|vi |och |tack/i.test(reply)));
  }

  if (expected.recordsBudget) {
    checks.push(
      check("records the budget", draft.budget !== null, draft.budget ? `${draft.budget.amountMinor}` : "null"),
    );
  }

  if (expected.headcountIsEstimated) {
    const estimated = draft.events.some((event) => event.headcountCertainty === "estimated");
    checks.push(
      check(
        "marks the headcount as estimated",
        estimated,
        draft.events.map((e) => e.headcountCertainty).join(","),
      ),
    );
  }

  if (expected.recommendsFlexibleQuantity) {
    // Either it proposed one, or it applied one because the manager asked.
    const suggested = draft.items.some((item) => item.suggested?.quantityEditable);
    const applied = draft.items.some((item) => item.quantityEditable);
    checks.push(check("recommends a flexible quantity", suggested || applied));
  }

  if (expected.suggestionsNotApplied) {
    // An unprompted recommendation must wait for the manager.
    const pending = draft.items.filter((item) => item.suggested !== null);
    const appliedWithoutAsking = draft.items.filter(
      (item) => item.quantityEditable && item.role === "core",
    );
    checks.push(
      check(
        "leaves its own recommendation as a suggestion",
        pending.length > 0 && appliedWithoutAsking.length === 0,
        `${pending.length} pending, ${appliedWithoutAsking.length} applied`,
      ),
    );
  }

  if (expected.addonsOptionalOrUnmatched) {
    const addons = draft.items.filter((item) => item.role === "addon");
    const unmatched = draft.requirements.filter((r) => r.status === "unmatched");
    const addonsAreOptional = addons.every((item) => item.optional);

    checks.push(
      check(
        "extras are optional add-ons or recorded as unmatched",
        (addons.length > 0 && addonsAreOptional) || unmatched.length > 0,
        `${addons.length} add-ons, ${unmatched.length} unmatched`,
      ),
    );
  }

  if (expected.noPendingSuggestions) {
    const pending = draft.items.filter((item) => item.suggested !== null);
    checks.push(
      check("applies directly, with nothing left pending", pending.length === 0, `${pending.length} pending`),
    );
  }

  if (expected.appliedDirectly) {
    const spec = expected.appliedDirectly;
    const optionalItem = draft.items.find((item) =>
      item.title.toLowerCase().includes(spec.optionalTitleContains.toLowerCase()),
    );
    const flexibleItem = draft.items.find((item) =>
      item.title.toLowerCase().includes(spec.flexibleTitleContains.toLowerCase()),
    );

    checks.push(
      check(
        `${spec.optionalTitleContains} is optional`,
        optionalItem?.optional === true,
        optionalItem ? `optional=${optionalItem.optional}` : "item not on the draft",
      ),
    );
    checks.push(
      check(
        `${spec.flexibleTitleContains} is flexible ${spec.flexibleMin}–${spec.flexibleMax}`,
        flexibleItem?.quantityEditable === true &&
          flexibleItem.quantityMin === spec.flexibleMin &&
          flexibleItem.quantityMax === spec.flexibleMax,
        flexibleItem
          ? `editable=${flexibleItem.quantityEditable} ${flexibleItem.quantityMin}-${flexibleItem.quantityMax}`
          : "item not on the draft",
      ),
    );
  }

  if (expected.neverExceedsDiscountPolicy) {
    // The agent may describe a reduction but never one outside policy, and it
    // may never apply one itself.
    const applied = draft.items.filter((item) => item.discount !== null);
    const overCap = /\b(2[0-9]|[3-9][0-9])\s?%/.test(reply);

    checks.push(check("applies no discount itself", applied.length === 0, `${applied.length} applied`));
    checks.push(check("never mentions a discount above the policy cap", !overCap));
  }

  if (expected.proposesNothing) {
    const touched =
      draft.events.length > 0 || draft.items.length > 0 || draft.requirements.length > 0;

    checks.push(check("changes nothing before it has an answer", !touched));
  }

  if (expected.resolvesRelativeDate) {
    const { weekday, notBefore } = expected.resolvesRelativeDate;
    const date = draft.events[0]?.date ?? null;
    const resolved =
      date !== null &&
      date > notBefore &&
      new Date(`${date}T00:00:00Z`).getUTCDay() === weekday;

    checks.push(check(`resolves the relative date`, resolved, date ?? "null"));
  }

  return checks;
}

async function runFixture(fixture: Fixture, knownVariationIds: Set<number>) {
  const inquiry = toInquiry(fixture);
  const store = memoryDraftStore(emptyDraft(fixture.inquiry.language));
  const { AI_MODEL } = loadEnv();

  const started = Date.now();
  const result = await generateText({
    model: AI_MODEL,
    system: buildSystemPrompt({ inquiry, draft: emptyDraft(fixture.inquiry.language), today: fixture.today }),
    tools: createAgentTools(inquiry.id, store),
    stopWhen: stepCountIs(12),
    messages: [{ role: "user", content: fixture.firstTurn ?? FIRST_TURN }],
  });

  const draft = await store.load();
  const checks = evaluate(fixture, draft, result.text, knownVariationIds);

  return {
    fixture,
    draft,
    reply: result.text,
    checks,
    steps: result.steps.length,
    ms: Date.now() - started,
  };
}

async function main() {
  const filters = process.argv.slice(2);
  const files = (await readdir(FIXTURE_DIR)).filter((file) => file.endsWith(".json")).sort();
  const selected = filters.length
    ? files.filter((file) => filters.some((filter) => file.includes(filter)))
    : files;

  if (selected.length === 0) {
    console.error(`No fixtures matched ${filters.join(", ")}`);
    process.exit(1);
  }

  const library = await getContentLibrary();
  const knownVariationIds = new Set(library.map((product) => product.variationId));
  console.log(`Content library: ${library.length} priced products\n`);

  const runs = [];
  for (const file of selected) {
    const fixture = fixtureSchema.parse(
      JSON.parse(await readFile(path.join(FIXTURE_DIR, file), "utf8")),
    );

    process.stdout.write(`running ${fixture.id}… `);
    try {
      const run = await runFixture(fixture, knownVariationIds);
      const failed = run.checks.filter((c) => !c.passed).length;
      console.log(failed === 0 ? `ok (${run.ms}ms)` : `${failed} failed (${run.ms}ms)`);
      runs.push(run);
    } catch (error) {
      console.log("ERROR");
      runs.push({
        fixture,
        draft: emptyDraft(),
        reply: "",
        checks: [check("ran without error", false, error instanceof Error ? error.message : String(error))],
        steps: 0,
        ms: 0,
      });
    }
  }

  const rows = runs.map((run) => {
    const passed = run.checks.filter((c) => c.passed).length;
    return {
      id: run.fixture.id,
      name: run.fixture.name,
      passed,
      total: run.checks.length,
      events: run.draft.events.length,
      items: run.draft.items.length,
      steps: run.steps,
      ms: run.ms,
      checks: run.checks,
      reply: run.reply,
    };
  });

  const width = Math.max(...rows.map((row) => row.id.length));
  console.log(`\n${"fixture".padEnd(width)}  checks  events  items  steps  time`);
  console.log("-".repeat(width + 34));
  for (const row of rows) {
    console.log(
      `${row.id.padEnd(width)}  ${`${row.passed}/${row.total}`.padStart(6)}  ` +
        `${String(row.events).padStart(6)}  ${String(row.items).padStart(5)}  ` +
        `${String(row.steps).padStart(5)}  ${String(row.ms).padStart(5)}ms`,
    );
  }

  const totalChecks = rows.reduce((sum, row) => sum + row.total, 0);
  const totalPassed = rows.reduce((sum, row) => sum + row.passed, 0);
  const inventedAnywhere = rows.some((row) =>
    row.checks.some((c) => c.name === "no invented product ids" && !c.passed),
  );

  console.log(
    `\n${totalPassed}/${totalChecks} checks passed across ${rows.length} fixtures. ` +
      `Invented product ids: ${inventedAnywhere ? "YES — investigate" : "none"}.`,
  );

  await writeFile(RESULTS_FILE, renderMarkdown(rows, { totalPassed, totalChecks, inventedAnywhere }));
  console.log(`Wrote ${RESULTS_FILE}`);

  process.exit(totalPassed === totalChecks ? 0 : 1);
}

function renderMarkdown(
  rows: {
    id: string;
    name: string;
    passed: number;
    total: number;
    events: number;
    items: number;
    steps: number;
    ms: number;
    checks: Check[];
    reply: string;
  }[],
  summary: { totalPassed: number; totalChecks: number; inventedAnywhere: boolean },
): string {
  const lines = [
    "# Eval results",
    "",
    `Run on ${new Date().toISOString().slice(0, 10)} against the live content library.`,
    "",
    `**${summary.totalPassed}/${summary.totalChecks} checks passed** across ${rows.length} fixtures. ` +
      `Invented product ids: ${summary.inventedAnywhere ? "**yes — investigate**" : "none"}.`,
    "",
    "| Fixture | Checks | Events | Items | Steps |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) => `| ${row.name} | ${row.passed}/${row.total} | ${row.events} | ${row.items} | ${row.steps} |`,
    ),
    "",
    "## Detail",
    "",
  ];

  for (const row of rows) {
    lines.push(`### ${row.name}`, "");
    for (const c of row.checks) {
      lines.push(`- ${c.passed ? "✅" : "❌"} ${c.name}${c.detail ? ` — \`${c.detail}\`` : ""}`);
    }
    lines.push("", "<details><summary>Reply</summary>", "", "```", row.reply.trim(), "```", "</details>", "");
  }

  return lines.join("\n");
}

await main();
