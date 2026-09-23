import type { CatalogProduct, WorkingDraft } from "./draft";

/**
 * Catches items whose library price has moved since the draft was built, so a
 * manager is warned before sending a version quoting a stale number (D14).
 */
export type PriceChange = {
  itemId: string;
  title: string;
  wasMinor: number;
  nowMinor: number;
  currency: string;
};

export function findPriceChanges(
  draft: WorkingDraft,
  library: Pick<CatalogProduct, "variationId" | "unitPriceMinor" | "currency">[],
): PriceChange[] {
  const byVariation = new Map(library.map((product) => [product.variationId, product]));

  return draft.items.flatMap((item) => {
    const current = byVariation.get(item.variationId);
    if (!current || current.unitPriceMinor === item.unitPriceMinor) return [];

    return [
      {
        itemId: item.id,
        title: item.title,
        wasMinor: item.unitPriceMinor,
        nowMinor: current.unitPriceMinor,
        currency: item.currency,
      },
    ];
  });
}

/** Brings the draft's prices in line with the library. */
export function applyPriceChanges(draft: WorkingDraft, changes: PriceChange[]): WorkingDraft {
  if (changes.length === 0) return draft;

  const byItem = new Map(changes.map((change) => [change.itemId, change]));

  return {
    ...draft,
    items: draft.items.map((item) => {
      const change = byItem.get(item.id);
      return change ? { ...item, unitPriceMinor: change.nowMinor } : item;
    }),
  };
}
