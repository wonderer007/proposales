/**
 * Seeds the demo hotel's catalog: creates each product in the Proposales
 * content library and records its pricing locally in `content_catalog`.
 *
 * The content API stores only title, description and images, so unit, type,
 * price and VAT have to live on our side, keyed by the returned variation_id.
 *
 *   bun run scripts/seed-content.ts --dry-run
 *   bun run scripts/seed-content.ts
 *
 * Idempotent. A product whose title already exists in the library is never
 * created again; its ids are reused to (re)build the catalog row, which is
 * also how you backfill pricing for products created outside this script:
 * add an entry with the exact existing title and re-run.
 */
import { db } from "@/lib/db/client";
import { contentCatalog } from "@/lib/db/schema";
import { loadEnv } from "@/env.schema";
import { ProposalesError, createContent, listCompanies, listContent } from "@/lib/proposales/client";
import { pickLocalized, type ContentType, type Unit } from "@/lib/proposales/schemas";

type SeedProduct = {
  title: string;
  description: string;
  unit: Unit;
  contentType: ContentType;
  /** Price for one unit excluding VAT, in minor units (cents). */
  unitPriceMinor: number;
  /** Swedish VAT: 25% general, 12% food and accommodation. */
  vatRate: number;
  /** Unsplash photo id; see IMAGE_BASE. Each was checked by eye. */
  photoId: string;
};

/**
 * Images come from Unsplash, whose licence allows commercial use without
 * attribution. Proposales downloads the URL at create time and re-hosts it on
 * Uploadcare, so these links only need to resolve during the seed run.
 */
const IMAGE_BASE = "https://images.unsplash.com/photo-";
const IMAGE_PARAMS = "?w=1600&q=80";

function imageUrl(photoId: string): string {
  return `${IMAGE_BASE}${photoId}${IMAGE_PARAMS}`;
}

/**
 * Hotell Vasaparken — a fictional Stockholm conference hotel.
 * Capacities are stated in the descriptions so the agent can match on them.
 */
const PRODUCTS: SeedProduct[] = [
  // ----------------------------------------------------------- meeting rooms
  {
    title: "Board Room",
    description:
      "Intimate boardroom seating 12 around a fixed table. 65-inch screen, " +
      "video conferencing and whiteboard included. Daylight, top floor.",
    unit: "day",
    contentType: "meetingRoom",
    unitPriceMinor: 45_000,
    vatRate: 0.25,
    photoId: "1517048676732-d65bc937f952",
  },
  {
    title: "Vasa Room",
    description:
      "Our most popular conference room. Seats 25 boardroom style or 40 theatre " +
      "style. Projector and screen included, blackout blinds, air conditioning.",
    unit: "day",
    contentType: "meetingRoom",
    unitPriceMinor: 85_000,
    vatRate: 0.25,
    photoId: "1511578314322-379afb476865",
  },
  {
    title: "Skansen Room",
    description:
      "Bright corner room seating 26 boardroom style or 50 theatre style. " +
      "Projector and screen included, two flip charts, direct access to the terrace.",
    unit: "day",
    contentType: "meetingRoom",
    unitPriceMinor: 80_000,
    vatRate: 0.25,
    photoId: "1540575467063-178a50c2df87",
  },
  {
    title: "Strandvägen Room",
    description:
      "U-shape seating for 20, or 30 in rows. Wall-mounted screen with HDMI and " +
      "wireless casting. No projector.",
    unit: "day",
    contentType: "meetingRoom",
    unitPriceMinor: 75_000,
    vatRate: 0.25,
    photoId: "1556761175-5973dc0f32e7",
  },
  {
    title: "Gamla Stan Studio",
    description:
      "Small breakout room for up to 8 people, booked by the hour. " +
      "55-inch screen, whiteboard, coffee and water included.",
    unit: "h",
    contentType: "meetingRoom",
    unitPriceMinor: 9_000,
    vatRate: 0.25,
    photoId: "1524758631624-e2822e304c36",
  },

  // ------------------------------------------------------------ food & drink
  {
    title: "Full-day conference package",
    description:
      "Per person, per day: morning coffee with pastry, two-course lunch, " +
      "afternoon fika, and still and sparkling water in the meeting room.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 6_500,
    vatRate: 0.12,
    photoId: "1555396273-367ea4eb4db5",
  },
  {
    title: "Lunch buffet",
    description:
      "Two hot dishes with a salad bar, bread and coffee. Vegetarian and " +
      "vegan options always included. Served in the restaurant.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 3_200,
    vatRate: 0.12,
    photoId: "1576867757603-05b134ebc379",
  },
  {
    title: "Three-course dinner",
    description:
      "Seasonal three-course menu served in the private dining room, " +
      "seating up to 60. Dietary requirements catered for on request.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 6_900,
    vatRate: 0.12,
    photoId: "1414235077428-338989a2e8c0",
  },
  {
    title: "Christmas buffet",
    description:
      "Traditional julbord with herring, cured salmon, meatballs, ham and " +
      "desserts. Available from late November, minimum 20 guests.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 8_500,
    vatRate: 0.12,
    photoId: "1482275548304-a58859dc31b7",
  },
  {
    title: "Coffee break",
    description: "Coffee, tea and a sweet or savoury bite, served outside the meeting room.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 850,
    vatRate: 0.12,
    photoId: "1509042239860-f550ce710b93",
  },
  {
    title: "Fika",
    description: "Swedish afternoon fika: coffee, tea and freshly baked cinnamon buns.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 1_200,
    vatRate: 0.12,
    photoId: "1517686469429-8bdb88b9f907",
  },
  {
    title: "Welcome reception",
    description:
      "One hour of sparkling wine, beer and soft drinks with three canapés per guest. " +
      "Held in the lobby bar or on the terrace.",
    unit: "person",
    contentType: "food",
    unitPriceMinor: 1_500,
    vatRate: 0.12,
    photoId: "1519671482749-fd09be7ccebf",
  },

  // ----------------------------------------------------------- accommodation
  {
    title: "Standard double room",
    description:
      "Double room with breakfast, per room per night. Desk, fast Wi-Fi and " +
      "a courtyard or street view.",
    unit: "night",
    contentType: "accommodation",
    unitPriceMinor: 18_500,
    vatRate: 0.12,
    photoId: "1631049307264-da0ec9d70304",
  },
  {
    title: "Executive suite",
    description:
      "Separate living room and bedroom with breakfast, per suite per night. " +
      "Seats 6 for an informal meeting.",
    unit: "night",
    contentType: "accommodation",
    unitPriceMinor: 32_000,
    vatRate: 0.12,
    photoId: "1590490360182-c33d57733427",
  },

  // ------------------------------------------------------------------- other
  {
    title: "Projector and screen",
    description:
      "Full HD projector with a 2.5-metre screen and cabling, delivered to any " +
      "room that does not already include one. Charged per event.",
    unit: "unit",
    contentType: "other",
    unitPriceMinor: 4_500,
    vatRate: 0.25,
    photoId: "1505373877841-8d25f7d46678",
  },
  {
    title: "PA system with microphones",
    description:
      "Speakers, mixer and two wireless microphones, including setup and a " +
      "sound check. Charged per event.",
    unit: "unit",
    contentType: "other",
    unitPriceMinor: 9_500,
    vatRate: 0.25,
    photoId: "1516280440614-37939bbacd81",
  },
  {
    title: "Flip chart and markers",
    description: "Flip chart with paper and a set of markers. Charged per event.",
    unit: "unit",
    contentType: "other",
    unitPriceMinor: 1_500,
    vatRate: 0.25,
    photoId: "1552664730-d307ca884978",
  },
];

const SEED_LANGUAGE = "en";

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { PROPOSALES_COMPANY_ID } = loadEnv();
  const companyId = Number(PROPOSALES_COMPANY_ID);

  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new Error(`PROPOSALES_COMPANY_ID must be a positive integer, got "${PROPOSALES_COMPANY_ID}"`);
  }

  const company = (await listCompanies()).find((candidate) => candidate.id === companyId);

  if (!company) {
    throw new Error(`This API key has no access to company ${companyId}. Run scripts/whoami.ts.`);
  }

  const currency = company.currency;
  console.log(
    `${dryRun ? "[dry run] " : ""}Seeding ${PRODUCTS.length} products into "${company.name}" ` +
      `(company ${company.id}, ${currency}).\n`,
  );

  const library = await listContent({ companyId });
  const existingByTitle = new Map(
    library.map((item) => [normalizeTitle(pickLocalized(item.title, SEED_LANGUAGE)), item]),
  );

  let created = 0;
  let reused = 0;

  for (const product of PRODUCTS) {
    const existing = existingByTitle.get(normalizeTitle(product.title));

    let productId: number;
    let variationId: number;

    if (existing) {
      productId = existing.product_id;
      variationId = existing.variation_id;
      reused += 1;
      console.log(`  = ${product.title.padEnd(28)} already in library (variation ${variationId})`);
    } else if (dryRun) {
      productId = -1;
      variationId = -1;
      created += 1;
      console.log(`  + ${product.title.padEnd(28)} would be created`);
    } else {
      const result = await createContent({
        company_id: companyId,
        language: SEED_LANGUAGE,
        title: product.title,
        description: product.description,
        images: [{ uuid: "", url: imageUrl(product.photoId) }],
      });
      productId = result.product_id;
      variationId = result.variation_id;
      created += 1;
      console.log(`  + ${product.title.padEnd(28)} created (variation ${variationId})`);
    }

    const pricing =
      `${product.unit.padEnd(6)} ${product.contentType.padEnd(13)} ` +
      `${formatMoney(product.unitPriceMinor, currency).padStart(12)} ` +
      `+ ${(product.vatRate * 100).toFixed(0)}% VAT`;
    console.log(`      ${pricing}`);
    if (dryRun) console.log(`      image  ${imageUrl(product.photoId)}`);

    if (dryRun) continue;

    await db
      .insert(contentCatalog)
      .values({
        variationId,
        productId,
        title: product.title,
        unit: product.unit,
        contentType: product.contentType,
        unitPriceMinor: product.unitPriceMinor,
        vatRate: product.vatRate,
        currency,
      })
      .onConflictDoUpdate({
        target: contentCatalog.variationId,
        set: {
          productId,
          title: product.title,
          unit: product.unit,
          contentType: product.contentType,
          unitPriceMinor: product.unitPriceMinor,
          vatRate: product.vatRate,
          currency,
          updatedAt: new Date(),
        },
      });
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}Done. ${created} ${dryRun ? "would be created" : "created"}, ` +
      `${reused} already in the library.` +
      (dryRun ? " No catalog rows written." : ` ${PRODUCTS.length} catalog rows up to date.`),
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof ProposalesError) {
    console.error(`\nProposales request failed (${error.method} ${error.path}): ${error.message}`);
    for (const issue of error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  throw error;
}
