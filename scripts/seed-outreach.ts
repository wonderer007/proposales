/**
 * Seeds the customers the outreach radar is demonstrated with (D17).
 *
 * Four hand-written scenario customers back the acceptance criteria, followed
 * by a fuller history of repeat customers so the radar, the inquiry list and
 * its pagination have realistic volume.
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
  Language,
  NewInquiry,
  NewInquiryEvent,
  NewProposal,
  RejectionCategory,
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

const SCENARIO: Seed[] = [
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


/* ------------------------------------------------------------------ */
/* A fuller history                                                    */
/* ------------------------------------------------------------------ */

/**
 * The four scenario seeds above back the acceptance criteria and keep their
 * hand-written ids. Everything below is the bulk history — enough repeat
 * customers for the radar, the inquiry list and the pagination to look like a
 * real inbox rather than a fixture.
 *
 * Every `createdAt` is in the past. Event dates are too, with one deliberate
 * exception: Ida Ström has a booking already on the books for early 2027, which
 * is what makes her demonstrate the `existing_inquiry` exclusion.
 *
 * The dates are not arbitrary. A lead's contact date is
 * `lastEvent + interval - leadDays`, so to surface in a window that opens in
 * late 2026 an annual customer's last event has to fall in Dec 2025 – Feb 2026,
 * a quarterly one's in Aug – Sep 2026, and a monthly one's within about a
 * fortnight of today. Each customer below says which it is.
 */

type Visit = {
  /** ISO date of the event. */
  date: string;
  type: "conference" | "meeting" | "dinner";
  headcount: number;
  startTime?: string;
  endTime?: string;
  /** ISO timestamp the inquiry arrived; defaults to ten weeks before the event. */
  createdAt?: string;
  message: string;
  /** Omitted when the inquiry never got as far as a proposal. */
  proposal?: {
    status: "accepted" | "rejected" | "active" | "expired";
    rejectionReason?: string;
    rejectionCategory?: RejectionCategory;
  };
};

type Customer = {
  /** 1–99, fixes this customer's row ids. */
  n: number;
  contactName: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  language: Language;
  cadence: { cadence: Cadence; confidence: number; evidence: string };
  /** Oldest first. */
  visits: Visit[];
};

/** Deterministic uuids, so re-running the seed is a no-op. */
function rowId(kind: 1 | 2 | 3, customer: number, index: number): string {
  const tail = `${kind}${String(customer).padStart(3, "0")}${String(index).padStart(3, "0")}00000`;
  return `d1700001-0000-4000-8000-${tail}`;
}

/** Ten weeks before the event, which is when most of these would have come in. */
function tenWeeksBefore(date: string): Date {
  const at = new Date(`${date}T09:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() - 70);
  return at;
}

function expand(customer: Customer): Seed[] {
  return customer.visits.map((visit, index) => {
    const draft =
      visit.type === "dinner"
        ? dinnerDraft({ date: visit.date, headcount: visit.headcount })
        : pastDraft({ date: visit.date, headcount: visit.headcount, type: visit.type });

    const createdAt = visit.createdAt ? new Date(visit.createdAt) : tenWeeksBefore(visit.date);

    return {
      inquiry: {
        id: rowId(1, customer.n, index),
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        companyName: customer.companyName,
        language: customer.language,
        message: visit.message,
        workingDraft: draft,
        createdAt,
      },
      events: [
        {
          id: rowId(2, customer.n, index),
          date: visit.date,
          startTime: visit.startTime ?? (visit.type === "dinner" ? "18:00" : "09:00"),
          endTime: visit.endTime ?? (visit.type === "dinner" ? "23:00" : "17:00"),
          position: 0,
        },
      ],
      proposals: visit.proposal
        ? [
            {
              id: rowId(3, customer.n, index),
              proposalesUuid: `seed-outreach-${customer.n}-${index}`,
              proposalesUrl: `https://app.proposales.com/p/seed-outreach-${customer.n}-${index}`,
              version: 1,
              status: visit.proposal.status,
              snapshot: draft,
              rejectionReason: visit.proposal.rejectionReason ?? null,
              rejectionCategory: visit.proposal.rejectionCategory ?? null,
              createdAt: new Date(createdAt.getTime() + 86_400_000),
            },
          ]
        : undefined,
      cadence: { ...customer.cadence, source: "ai" as CadenceSource },
    } satisfies Seed;
  });
}

const CUSTOMERS: Customer[] = [
  // --- Due to be contacted -------------------------------------------------
  {
    // Annual, last event Jan 2026 -> contact early Nov 2026.
    n: 1,
    contactName: "Lisa Ahlgren",
    email: "lisa.ahlgren@vinterhav.se",
    companyName: "Vinterhav AB",
    phone: "+46 70 311 22 08",
    language: "en",
    cadence: {
      cadence: "annual", confidence: 0.94,
      evidence: '"our yearly January conference, same as always"',
    },
    visits: [
      {
        date: "2024-01-18", type: "conference", headcount: 45,
        message: "Our yearly January conference, same as always. 45 people, full day with lunch.",
        proposal: { status: "accepted" },
      },
      {
        date: "2025-01-17", type: "conference", headcount: 50,
        message: "Time for the yearly January conference again — 50 of us this time.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-01-16", type: "conference", headcount: 55,
        message: "Our yearly January conference. 55 people, full day with lunch as usual.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    // Annual, last event Feb 2026 -> contact late Nov 2026.
    n: 2,
    contactName: "Oskar Berg",
    email: "oskar.berg@havsbris.se",
    companyName: "Havsbris Konsult",
    phone: "+46 73 902 14 55",
    language: "en",
    cadence: {
      cadence: "annual", confidence: 0.88,
      evidence: '"our annual strategy day"',
    },
    visits: [
      {
        date: "2026-02-05", type: "meeting", headcount: 22,
        message: "We hold our annual strategy day in early February. 22 people, room and lunch.",
        proposal: {
          status: "rejected",
          rejectionReason: "We went with a venue closer to our office this year.",
          rejectionCategory: "competitor",
        },
      },
    ],
  },
  {
    // Quarterly, last event Sep 2026 -> contact early Nov 2026.
    n: 3,
    contactName: "Nina Falk",
    email: "nina.falk@stenhusgroup.se",
    companyName: "Stenhus Group",
    phone: "+46 76 440 91 30",
    language: "en",
    cadence: {
      cadence: "quarterly", confidence: 0.96,
      evidence: '"our quarterly board meeting, four times a year"',
    },
    visits: [
      {
        date: "2025-12-09", type: "meeting", headcount: 14,
        message: "Our quarterly board meeting, four times a year. 14 people, half day.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-03-10", type: "meeting", headcount: 14,
        message: "Next quarterly board meeting, 10 March. Same setup as December please.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-06-08", type: "meeting", headcount: 16,
        message: "Quarterly board meeting again — 16 this time, we have two new members.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-09-07", type: "meeting", headcount: 16,
        message: "Our quarterly board meeting for Q3. 16 people, same room if it is free.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    // Quarterly, last event Aug 2026 -> contact late Oct 2026.
    n: 4,
    contactName: "Tobias Lund",
    email: "tobias.lund@klarvik.se",
    companyName: "Klarvik AB",
    phone: "+46 70 655 18 24",
    language: "en",
    cadence: {
      cadence: "quarterly", confidence: 0.91,
      evidence: '"every quarter we run a review day"',
    },
    visits: [
      {
        date: "2026-02-19", type: "meeting", headcount: 30,
        message: "Every quarter we run a review day. Next one 19 February, 30 people.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-05-21", type: "meeting", headcount: 28,
        message: "Quarterly review day, 21 May. 28 people this time.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-08-20", type: "meeting", headcount: 32,
        message: "Our quarterly review day on 20 August. 32 people, projector needed.",
        proposal: {
          status: "rejected",
          rejectionReason: "Too expensive once AV was added on top.",
          rejectionCategory: "price",
        },
      },
    ],
  },
  {
    // Monthly, last event Sep 2026 -> contact early Oct 2026.
    n: 5,
    contactName: "Maja Rehn",
    email: "maja.rehn@solbackenmedia.se",
    companyName: "Solbacken Media",
    phone: "+46 73 128 77 41",
    language: "en",
    cadence: {
      cadence: "monthly", confidence: 0.92,
      evidence: '"our monthly workshop day"',
    },
    visits: [
      {
        date: "2026-06-22", type: "meeting", headcount: 12,
        message: "Booking our monthly workshop day again. 12 people, 22 June.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-07-21", type: "meeting", headcount: 12,
        message: "Monthly workshop day, 21 July. Same as last month.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-08-20", type: "meeting", headcount: 15,
        message: "Monthly workshop day on 20 August, 15 people this time.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-09-21", type: "meeting", headcount: 15,
        message: "Our monthly workshop day, 21 September. 15 people.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    // Annual, last event Jan 2026 -> contact late Oct 2026.
    n: 6,
    contactName: "Henrik Ask",
    email: "henrik.ask@nordpil.se",
    companyName: "Nordpil Industri",
    phone: "+46 70 884 26 19",
    language: "sv",
    cadence: {
      cadence: "annual", confidence: 0.9,
      evidence: '"vårt årliga nyårsmöte" — hålls varje januari',
    },
    visits: [
      {
        date: "2025-01-09", type: "conference", headcount: 70,
        message: "Hej! Vårt årliga nyårsmöte den 9 januari, 70 personer, heldag med lunch.",
        proposal: { status: "accepted" },
      },
      {
        date: "2026-01-08", type: "conference", headcount: 80,
        message: "Vårt årliga nyårsmöte igen, 8 januari. 80 personer i år.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    // Annual, never quoted -> contact early Nov 2026.
    n: 7,
    contactName: "Sara Vinter",
    email: "sara.vinter@lysgrand.se",
    companyName: "Lysgränd AB",
    phone: null,
    language: "en",
    cadence: {
      cadence: "annual", confidence: 0.86,
      evidence: '"our kickoff, which we hold every January"',
    },
    visits: [
      {
        date: "2026-01-22", type: "conference", headcount: 35,
        message: "Asking about our kickoff, which we hold every January. 35 people, one day.",
      },
    ],
  },

  // --- Never suggested, for contrast --------------------------------------
  {
    n: 8,
    contactName: "Anders Frisk",
    email: "anders.frisk@brogatanventures.com",
    companyName: "Brogatan Ventures",
    phone: "+46 76 200 45 12",
    language: "en",
    cadence: {
      cadence: "one_off", confidence: 0.93,
      evidence: '"launch party for our first product" — a launch happens once',
    },
    visits: [
      {
        date: "2026-04-14", type: "dinner", headcount: 90,
        message: "We are holding a launch party for our first product on 14 April. 90 guests.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    n: 9,
    contactName: "Elsa Norén",
    email: "elsa.noren@mailbox-test.se",
    companyName: null,
    phone: "+46 70 771 05 63",
    language: "sv",
    cadence: {
      cadence: "one_off", confidence: 0.95,
      evidence: '"min 50-årsfest" — en engångshändelse',
    },
    visits: [
      {
        date: "2026-03-07", type: "dinner", headcount: 40,
        message: "Hej! Jag vill boka min 50-årsfest den 7 mars, ungefär 40 gäster.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    n: 10,
    contactName: "Viktor Sand",
    email: "viktor.sand@almoteknik.se",
    companyName: "Almö Teknik",
    phone: "+46 73 616 39 87",
    language: "en",
    cadence: {
      cadence: "unknown", confidence: 0.15,
      evidence: "No mention of recurrence — a single meeting with a date and a headcount.",
    },
    visits: [
      {
        date: "2026-05-12", type: "meeting", headcount: 18,
        message: "Do you have a room for 18 people on 12 May? Half a day, coffee would be good.",
        proposal: { status: "expired" },
      },
    ],
  },
  {
    n: 11,
    contactName: "Freja Holt",
    email: "freja.holt@kustlinjen.se",
    companyName: "Kustlinjen AB",
    phone: null,
    language: "en",
    cadence: {
      cadence: "unknown", confidence: 0.2,
      evidence: "Nothing about repeating — one offsite, no cadence words.",
    },
    visits: [
      {
        date: "2026-07-02", type: "meeting", headcount: 24,
        message: "We are planning an offsite on 2 July for 24 people. What would that cost?",
        proposal: { status: "active" },
      },
    ],
  },
  {
    // Annual, but the last event was two years ago. The radar projects one
    // cycle forward from it, so the expected date is already in the past and
    // this customer is never suggested — see "Known gaps" in the README.
    n: 12,
    contactName: "Gustav Ek",
    email: "gustav.ek@tallmobygg.se",
    companyName: "Tallmo Bygg",
    phone: "+46 70 443 81 20",
    language: "sv",
    cadence: {
      cadence: "annual", confidence: 0.89,
      evidence: '"vårt årliga julbord"',
    },
    visits: [
      {
        date: "2023-12-14", type: "dinner", headcount: 55,
        message: "Hej! Vårt årliga julbord den 14 december, 55 personer.",
        proposal: { status: "accepted" },
      },
      {
        date: "2024-12-12", type: "dinner", headcount: 60,
        message: "Vårt årliga julbord igen, 12 december. 60 personer i år.",
        proposal: { status: "accepted" },
      },
    ],
  },
  {
    // Annual and otherwise due, but already booked for around the expected
    // date, so the radar stays quiet.
    n: 13,
    contactName: "Ida Ström",
    email: "ida.strom@fyrtornet.se",
    companyName: "Fyrtornet AB",
    phone: "+46 76 305 62 74",
    language: "en",
    cadence: {
      cadence: "annual", confidence: 0.93,
      evidence: '"our annual partner day, end of January every year"',
    },
    visits: [
      {
        date: "2026-01-29", type: "conference", headcount: 65,
        message: "Our annual partner day, end of January every year. 65 people, full day.",
        proposal: { status: "accepted" },
      },
      {
        // Already on the books for next year.
        date: "2027-02-03", type: "conference", headcount: 70,
        createdAt: "2026-08-18T09:00:00.000Z",
        message: "Getting ahead of ourselves — booking the partner day for 3 February 2027, 70 people.",
      },
    ],
  },
  {
    // The classifier's answer is below the 0.7 bar, so it is treated as
    // unknown and never scheduled. Screen 2 offers it as a suggestion the
    // manager can accept.
    n: 14,
    contactName: "Rasmus Vik",
    email: "rasmus.vik@sjokanten.se",
    companyName: "Sjökanten AB",
    phone: "+46 73 519 44 02",
    language: "en",
    cadence: {
      cadence: "quarterly", confidence: 0.55,
      evidence: '"we tend to do these a few times a year" — suggestive, but not stated',
    },
    visits: [
      {
        date: "2026-08-25", type: "meeting", headcount: 20,
        message:
          "Looking for a room on 25 August for 20 people. We tend to do these a few times a year.",
        proposal: { status: "accepted" },
      },
    ],
  },
];

const SEEDS: Seed[] = [...SCENARIO, ...CUSTOMERS.flatMap(expand)];

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
