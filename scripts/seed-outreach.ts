/**
 * Seeds the four customers the outreach radar is demonstrated with (D17).
 *
 *   bun run outreach:seed
 *   bun run outreach:seed --reset-cadence   # clear the cadences and re-classify on the next scan
 *
 * Idempotent: every row carries a fixed id, so re-running skips what is already
 * there.
 *
 * The scenario is the one in the acceptance criteria — visit
 * `/outreach?today=2026-10-05&from=2026-10-01&to=2026-12-01` and the first
 * three appear, sorted by recommended contact date, while the wedding does not.
 *
 * Emails are deliberately unique to these four. A seeded customer sharing an
 * email with an existing inquiry is grouped with it, and the newest inquiry in
 * the group — not the seeded one — then decides the cadence.
 *
 * Event dates are not arbitrary. For an annual cadence the contact date is
 * `event + 365 - 75`, so to land inside a window starting 2026-10-01 the last
 * event has to be on or after 2025-12-17 — a "December 2025" event dated the
 * 12th would fall ten days short of the window and silently not appear.
 */
import { inArray } from "drizzle-orm";

import { addItem, emptyDraft, upsertEvent } from "@/lib/builder/draft";
import type { CatalogProduct, WorkingDraft } from "@/lib/builder/draft";
import { db } from "@/lib/db/client";
import { inquiries, inquiryEvents, proposals } from "@/lib/db/schema";
import type {
  Cadence,
  CadenceSource,
  NewInquiry,
  NewInquiryEvent,
  NewProposal,
} from "@/lib/db/schema";

/**
 * Products for the snapshots below. The ids match `scripts/seed-content.ts`;
 * they are only used to render what a past proposal was worth, so a mismatched
 * library shows the wrong title but breaks nothing.
 */
const VASA_ROOM: CatalogProduct = {
  productId: 189_236, variationId: 189_235, title: "Vasa Room", unit: "day",
  contentType: "meetingRoom", unitPriceMinor: 85_000, vatRate: 0.25, currency: "EUR",
};

const LUNCH_BUFFET: CatalogProduct = {
  productId: 189_241, variationId: 189_240, title: "Lunch buffet", unit: "person",
  contentType: "food", unitPriceMinor: 3_200, vatRate: 0.12, currency: "EUR",
};

/** A minimal past proposal: one room for the day, lunch for everyone. */
function pastDraft({
  date,
  headcount,
  type,
}: {
  date: string;
  headcount: number;
  type: "conference" | "meeting";
}): WorkingDraft {
  let draft = emptyDraft("en");

  draft = upsertEvent(draft, {
    id: "evt-main", type, date, startTime: "09:00", endTime: "17:00", headcount, inferred: [],
  });
  draft = upsertEvent(draft, {
    id: "evt-lunch", type: "lunch", date, startTime: "12:00", endTime: "13:00", headcount,
    inferred: ["date", "headcount"],
  });

  draft = addItem(draft, { id: "itm-room", eventId: "evt-main", product: VASA_ROOM });
  draft = addItem(draft, { id: "itm-lunch", eventId: "evt-lunch", product: LUNCH_BUFFET });

  return draft;
}

/** An inquiry that never got as far as a proposal: an event, no items. */
function dinnerDraft({ date, headcount }: { date: string; headcount: number }): WorkingDraft {
  return upsertEvent(emptyDraft("sv"), {
    id: "evt-dinner", type: "dinner", date, startTime: "18:00", endTime: "23:00", headcount,
    inferred: [],
  });
}

type Seed = {
  inquiry: NewInquiry;
  events: Omit<NewInquiryEvent, "inquiryId">[];
  proposals?: Omit<NewProposal, "inquiryId">[];
  /** What the classifier should conclude, pre-filled so the demo is deterministic. */
  cadence: { cadence: Cadence; confidence: number; evidence: string; source: CadenceSource };
};

const SEEDS: Seed[] = [
  {
    // Annual, accepted. Event 2025-12-20 → expected 2026-12-20, contact 2026-10-06.
    inquiry: {
      id: "d1700000-0000-4000-8000-000000000001",
      contactName: "Johan Persson",
      email: "johan.persson@perssonteknik.se",
      phone: "+46 70 555 11 22",
      companyName: "Persson Teknik AB",
      language: "en",
      message:
        "Hi! Time for our annual company kickoff again — same as every December. " +
        "We are 60 people this year, one full day with lunch. 20 December works best. " +
        "Could you put together a proposal?",
      workingDraft: pastDraft({ date: "2025-12-20", headcount: 60, type: "conference" }),
      createdAt: new Date("2025-10-02T09:00:00.000Z"),
    },
    events: [
      {
        id: "d1700000-0000-4000-8000-000000000011",
        date: "2025-12-20", startTime: "09:00", endTime: "17:00", position: 0,
      },
    ],
    proposals: [
      {
        id: "d1700000-0000-4000-8000-000000000021",
        proposalesUuid: "seed-outreach-persson-v1",
        proposalesUrl: "https://app.proposales.com/p/seed-outreach-persson-v1",
        version: 1,
        status: "accepted",
        snapshot: pastDraft({ date: "2025-12-20", headcount: 60, type: "conference" }),
        createdAt: new Date("2025-10-03T09:00:00.000Z"),
      },
    ],
    cadence: {
      cadence: "annual", confidence: 0.95,
      evidence: '"our annual company kickoff again — same as every December"',
      source: "ai",
    },
  },
  {
    // Quarterly, rejected on price. Event 2026-08-15 → expected 2026-11-14, contact 2026-10-15.
    inquiry: {
      id: "d1700000-0000-4000-8000-000000000002",
      contactName: "Petra Holm",
      email: "petra.holm@vasaparkengroup.se",
      phone: "+46 73 444 88 99",
      companyName: "Vasaparken Group",
      language: "en",
      message:
        "Hello, we hold our quarterly board review with you four times a year. " +
        "Next one is 15 August, 20 people, half a day with lunch. Same setup as last time.",
      workingDraft: pastDraft({ date: "2026-08-15", headcount: 20, type: "meeting" }),
      createdAt: new Date("2026-06-01T09:00:00.000Z"),
    },
    events: [
      {
        id: "d1700000-0000-4000-8000-000000000012",
        date: "2026-08-15", startTime: "09:00", endTime: "14:00", position: 0,
      },
    ],
    proposals: [
      {
        id: "d1700000-0000-4000-8000-000000000022",
        proposalesUuid: "seed-outreach-vasaparken-v1",
        proposalesUrl: "https://app.proposales.com/p/seed-outreach-vasaparken-v1",
        version: 1,
        status: "rejected",
        snapshot: pastDraft({ date: "2026-08-15", headcount: 20, type: "meeting" }),
        rejectionReason: "Too expensive — the day rate came in above what the board had approved.",
        rejectionCategory: "price",
        createdAt: new Date("2026-06-02T09:00:00.000Z"),
      },
    ],
    cadence: {
      cadence: "quarterly", confidence: 0.9,
      evidence: '"our quarterly board review with you four times a year"',
      source: "ai",
    },
  },
  {
    // Never quoted. Event 2025-12-18 → expected 2026-12-18, contact 2026-10-04.
    inquiry: {
      id: "d1700000-0000-4000-8000-000000000003",
      contactName: "Karin Ek",
      email: "karin.ek@nordlyskonsult.se",
      phone: null,
      companyName: "Nordlys Konsult",
      language: "sv",
      message:
        "Hej! Vi har vår årliga julmiddag den 18 december, ungefär 40 personer. " +
        "Vi brukar vara hos er varje år. Har ni plats?",
      workingDraft: dinnerDraft({ date: "2025-12-18", headcount: 40 }),
      createdAt: new Date("2025-11-20T09:00:00.000Z"),
    },
    events: [
      {
        id: "d1700000-0000-4000-8000-000000000013",
        date: "2025-12-18", startTime: "18:00", endTime: "23:00", position: 0,
      },
    ],
    cadence: {
      cadence: "annual", confidence: 0.93,
      evidence: '"vår årliga julmiddag" — och "vi brukar vara hos er varje år"',
      source: "ai",
    },
  },
  {
    // A wedding. Must never reach the radar, whatever the range.
    inquiry: {
      id: "d1700000-0000-4000-8000-000000000004",
      contactName: "Emil Dahl",
      email: "emil.dahl@example.com",
      phone: "+46 76 222 33 44",
      companyName: null,
      language: "en",
      message:
        "We are getting married on 6 June and would love to hold the reception with you. " +
        "About 80 guests, dinner and dancing.",
      createdAt: new Date("2025-09-15T09:00:00.000Z"),
    },
    events: [
      {
        id: "d1700000-0000-4000-8000-000000000014",
        date: "2026-06-06", startTime: "16:00", endTime: "01:00", position: 0,
      },
    ],
    cadence: {
      cadence: "one_off", confidence: 0.97,
      evidence: '"We are getting married" — a wedding does not repeat.',
      source: "ai",
    },
  },
];

const IDS = SEEDS.map((seed) => seed.inquiry.id!);

async function resetCadence() {
  await db
    .update(inquiries)
    .set({ cadence: null, cadenceConfidence: null, cadenceEvidence: null, cadenceSource: null })
    .where(inArray(inquiries.id, IDS));

  console.log(
    `Cleared the cadence on ${IDS.length} seeded inquiries — the next radar scan will classify them.`,
  );
}

async function main() {
  if (process.argv.includes("--reset-cadence")) {
    await resetCadence();
    return;
  }

  const existing = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(inArray(inquiries.id, IDS));
  const existingIds = new Set(existing.map((row) => row.id));

  const pending = SEEDS.filter((seed) => !existingIds.has(seed.inquiry.id!));

  if (pending.length === 0) {
    console.log(`Nothing to do — all ${SEEDS.length} outreach inquiries already exist.`);
    return;
  }

  for (const seed of pending) {
    const inquiryId = seed.inquiry.id!;

    await db.insert(inquiries).values({
      ...seed.inquiry,
      cadence: seed.cadence.cadence,
      cadenceConfidence: seed.cadence.confidence,
      cadenceEvidence: seed.cadence.evidence,
      cadenceSource: seed.cadence.source,
    });

    await db.insert(inquiryEvents).values(seed.events.map((event) => ({ ...event, inquiryId })));

    if (seed.proposals?.length) {
      await db.insert(proposals).values(
        seed.proposals.map((proposal) => ({ ...proposal, inquiryId })),
      );
    }

    console.log(
      `Inserted ${seed.inquiry.contactName} <${seed.inquiry.email}> — ` +
        `${seed.cadence.cadence}, ${seed.proposals?.length ?? 0} proposal(s)`,
    );
  }

  console.log(`Done. ${pending.length} inserted, ${existingIds.size} skipped.`);
}

await main();
