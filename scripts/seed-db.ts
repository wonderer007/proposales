/**
 * Seeds three sample inquiries. Idempotent: every row carries a fixed id, so
 * re-running skips what is already there.
 *
 *   bun run db:seed
 */
import { inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { inquiries, inquiryEvents } from "@/lib/db/schema";
import type { NewInquiry, NewInquiryEvent } from "@/lib/db/schema";

type Seed = { inquiry: NewInquiry; events: Omit<NewInquiryEvent, "inquiryId">[] };

const SEEDS: Seed[] = [
  {
    inquiry: {
      id: "11111111-1111-4111-8111-111111111111",
      contactName: "Anna Lindqvist",
      email: "anna.lindqvist@northstar.se",
      phone: "+46 70 123 45 67",
      companyName: "Northstar Consulting",
      language: "en",
      message:
        "Hi! We would like to book our quarterly meeting for 25 people on 14 October, " +
        "09:00 to 16:00. We need a room with a projector, and coffee during the morning. " +
        "Could you send us a proposal?",
    },
    events: [
      {
        id: "11111111-1111-4111-8111-000000000001",
        date: "2026-10-14",
        startTime: "09:00",
        endTime: "16:00",
        position: 0,
      },
    ],
  },
  {
    inquiry: {
      id: "22222222-2222-4222-8222-222222222222",
      contactName: "Marcus Hale",
      email: "marcus.hale@brightloop.com",
      phone: "+44 20 7946 0102",
      companyName: "Brightloop Ltd",
      language: "en",
      message:
        "Request from the website:\n" +
        "Type: Company meeting with lunch\n" +
        "Guests: 50\n" +
        "Date: 5 November 2026\n" +
        "Meeting: 09:00-12:00\n" +
        "Lunch: 12:00-13:00\n" +
        "Notes: We need a screen for presentations and a vegetarian option at lunch.",
    },
    events: [
      {
        id: "22222222-2222-4222-8222-000000000001",
        date: "2026-11-05",
        startTime: "09:00",
        endTime: "12:00",
        position: 0,
      },
      {
        id: "22222222-2222-4222-8222-000000000002",
        date: "2026-11-05",
        startTime: "12:00",
        endTime: "13:00",
        position: 1,
      },
    ],
  },
  {
    inquiry: {
      id: "33333333-3333-4333-8333-333333333333",
      contactName: "Elin Bergström",
      email: "elin.bergstrom@vasaevent.se",
      phone: "+46 73 987 65 43",
      companyName: "Vasa Event AB",
      language: "sv",
      message:
        "Hej! Vi planerar en julmiddag för 30 personer den 3 december, 18:00-22:00. " +
        "Vi vill gärna ha ett eget rum. Kan ni skicka en offert?",
    },
    events: [
      {
        id: "33333333-3333-4333-8333-000000000001",
        date: "2026-12-03",
        startTime: "18:00",
        endTime: "22:00",
        position: 0,
      },
    ],
  },
];

async function main() {
  const ids = SEEDS.map((seed) => seed.inquiry.id!).filter(Boolean);
  const existing = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(inArray(inquiries.id, ids));
  const existingIds = new Set(existing.map((row) => row.id));

  const pending = SEEDS.filter((seed) => !existingIds.has(seed.inquiry.id!));

  if (pending.length === 0) {
    console.log(`Nothing to do — all ${SEEDS.length} sample inquiries already exist.`);
    return;
  }

  for (const seed of pending) {
    await db.insert(inquiries).values(seed.inquiry);
    await db
      .insert(inquiryEvents)
      .values(seed.events.map((event) => ({ ...event, inquiryId: seed.inquiry.id! })));

    console.log(
      `Inserted ${seed.inquiry.contactName} <${seed.inquiry.email}> ` +
        `(${seed.events.length} event${seed.events.length === 1 ? "" : "s"})`,
    );
  }

  console.log(`Done. ${pending.length} inserted, ${existingIds.size} skipped.`);
}

await main();
