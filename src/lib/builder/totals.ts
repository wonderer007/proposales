import type { DraftItem, WorkingDraft } from "./draft";

/**
 * Money maths for the builder card (SPEC §4.4).
 *
 * Everything is in minor units and rounded once per line, so the displayed
 * line totals always add up to the displayed grand total.
 */

export type LineTotal = {
  itemId: string;
  exclVatMinor: number;
  vatMinor: number;
  inclVatMinor: number;
};

export type DraftTotals = {
  currency: string;
  lines: LineTotal[];
  exclVatMinor: number;
  vatMinor: number;
  inclVatMinor: number;
  /** VAT broken down by rate, for proposals mixing 12% food and 25% rooms. */
  vatByRate: { rate: number; exclVatMinor: number; vatMinor: number }[];
};

export function lineTotal(item: Pick<DraftItem, "id" | "unitPriceMinor" | "quantity" | "vatRate">): LineTotal {
  const exclVatMinor = Math.round(item.unitPriceMinor * item.quantity);
  const vatMinor = Math.round(exclVatMinor * item.vatRate);

  return { itemId: item.id, exclVatMinor, vatMinor, inclVatMinor: exclVatMinor + vatMinor };
}

export function calculateTotals(draft: WorkingDraft): DraftTotals {
  const lines = draft.items.map(lineTotal);

  const exclVatMinor = lines.reduce((sum, line) => sum + line.exclVatMinor, 0);
  const vatMinor = lines.reduce((sum, line) => sum + line.vatMinor, 0);

  const byRate = new Map<number, { rate: number; exclVatMinor: number; vatMinor: number }>();
  draft.items.forEach((item, index) => {
    const line = lines[index]!;
    const bucket = byRate.get(item.vatRate) ?? { rate: item.vatRate, exclVatMinor: 0, vatMinor: 0 };

    bucket.exclVatMinor += line.exclVatMinor;
    bucket.vatMinor += line.vatMinor;
    byRate.set(item.vatRate, bucket);
  });

  return {
    // Proposales allows one currency per proposal, so the first item decides.
    currency: draft.items[0]?.currency ?? "EUR",
    lines,
    exclVatMinor,
    vatMinor,
    inclVatMinor: exclVatMinor + vatMinor,
    vatByRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
  };
}

/** Formats minor units for display, e.g. 45000 → "450.00 EUR". */
export function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
