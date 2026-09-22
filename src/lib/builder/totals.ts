import type { Discount, DraftItem, WorkingDraft } from "./draft";

/**
 * Money maths for the builder card (SPEC §4.4, §6.5 rule 4).
 *
 * Everything is in minor units and rounded once per line, so the displayed
 * line totals always add up to the displayed grand total.
 *
 * Two totals are shown, because an offer with optional or flexible items has
 * no single price:
 *   - **committed** — what the customer is certain to pay: non-optional items
 *     at their current quantity.
 *   - **maximum** — the ceiling: every item, including optional ones, at its
 *     upper bound where the quantity is flexible.
 */

export type LineTotal = {
  itemId: string;
  quantity: number;
  /** Before any discount, excluding VAT. */
  grossExclVatMinor: number;
  discountMinor: number;
  exclVatMinor: number;
  vatMinor: number;
  inclVatMinor: number;
};

export type TotalsBreakdown = {
  lines: LineTotal[];
  exclVatMinor: number;
  vatMinor: number;
  inclVatMinor: number;
  /** VAT by rate, for proposals mixing 12% food and 25% meeting rooms. */
  vatByRate: { rate: number; exclVatMinor: number; vatMinor: number }[];
};

export type DraftTotals = TotalsBreakdown & {
  currency: string;
  /** The ceiling: all items at their maximum quantity. */
  maximum: TotalsBreakdown;
  /** True when the two differ, i.e. something is optional or flexible. */
  hasFlexibleValue: boolean;
};

type PricedItem = Pick<
  DraftItem,
  "id" | "unitPriceMinor" | "quantity" | "vatRate" | "discount"
>;

/** The discount in minor units for a line, given its undiscounted total. */
export function discountAmount(grossExclVatMinor: number, discount: Discount | null): number {
  if (!discount) return 0;

  // A percent applies to the line value; a fixed amount is already in minor
  // units and is applied excluding tax. Neither may take a line below zero.
  const raw =
    discount.type === "percent"
      ? Math.round(grossExclVatMinor * discount.value)
      : Math.round(discount.value);

  return Math.min(Math.max(raw, 0), grossExclVatMinor);
}

export function lineTotal(item: PricedItem, quantity = item.quantity): LineTotal {
  const grossExclVatMinor = Math.round(item.unitPriceMinor * quantity);
  const discountMinor = discountAmount(grossExclVatMinor, item.discount ?? null);
  const exclVatMinor = grossExclVatMinor - discountMinor;
  const vatMinor = Math.round(exclVatMinor * item.vatRate);

  return {
    itemId: item.id,
    quantity,
    grossExclVatMinor,
    discountMinor,
    exclVatMinor,
    vatMinor,
    inclVatMinor: exclVatMinor + vatMinor,
  };
}

/** The quantity a line reaches when the recipient pushes it to its ceiling. */
export function maximumQuantity(item: DraftItem): number {
  if (!item.quantityEditable || item.quantityMax === null) return item.quantity;

  return Math.max(item.quantity, item.quantityMax);
}

function summarise(items: DraftItem[], quantityOf: (item: DraftItem) => number): TotalsBreakdown {
  const lines = items.map((item) => lineTotal(item, quantityOf(item)));

  const byRate = new Map<number, { rate: number; exclVatMinor: number; vatMinor: number }>();
  items.forEach((item, index) => {
    const line = lines[index]!;
    const bucket = byRate.get(item.vatRate) ?? { rate: item.vatRate, exclVatMinor: 0, vatMinor: 0 };

    bucket.exclVatMinor += line.exclVatMinor;
    bucket.vatMinor += line.vatMinor;
    byRate.set(item.vatRate, bucket);
  });

  const exclVatMinor = lines.reduce((sum, line) => sum + line.exclVatMinor, 0);
  const vatMinor = lines.reduce((sum, line) => sum + line.vatMinor, 0);

  return {
    lines,
    exclVatMinor,
    vatMinor,
    inclVatMinor: exclVatMinor + vatMinor,
    vatByRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
  };
}

export function calculateTotals(draft: WorkingDraft): DraftTotals {
  const committed = summarise(
    draft.items.filter((item) => !item.optional),
    (item) => item.quantity,
  );
  const maximum = summarise(draft.items, maximumQuantity);

  return {
    ...committed,
    // Proposales allows one currency per proposal, so the first item decides.
    currency: draft.items[0]?.currency ?? "EUR",
    maximum,
    hasFlexibleValue: committed.inclVatMinor !== maximum.inclVatMinor,
  };
}

/** Formats minor units for display, e.g. 45000 → "450.00 EUR". */
export function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
