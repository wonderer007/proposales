import type { CatalogProduct, WorkingDraft } from "@/lib/builder/draft";
import { setItemDiscount, setItemOptions } from "@/lib/builder/draft";
import { calculateTotals } from "@/lib/builder/totals";
import { maxPercentFor } from "@/lib/pricing/validate";
import type { PricingPolicy } from "@/lib/pricing/policy";
import type { RejectionCategory } from "@/lib/db/schema";

/**
 * Ways to answer a rejection (SPEC D15), ordered by how much they concede:
 * restructure first, then swap to cheaper products, then reduce the rate.
 *
 * Pure: every figure here is computed, never written by the model. The agent
 * chooses which to talk about; the manager applies one on the card.
 */

export type RecoveryOptionKind = "restructure" | "alternatives" | "discount";

export type RecoveryChange =
  | { type: "make-optional"; itemId: string; title: string }
  | { type: "make-flexible"; itemId: string; title: string; min: number; max: number }
  | { type: "swap"; itemId: string; title: string; toVariationId: number; toTitle: string }
  | { type: "discount"; itemId: string; title: string; percent: number };

export type RecoveryOption = {
  kind: RecoveryOptionKind;
  title: string;
  detail: string[];
  changes: RecoveryChange[];
  /** Committed total including VAT once this option is applied. */
  committedInclVatMinor: number;
  /** Negative when the option reduces what the customer commits to. */
  deltaInclVatMinor: number;
  currency: string;
};

export type RecoveryInput = {
  draft: WorkingDraft;
  library: CatalogProduct[];
  policy: PricingPolicy;
  category: RejectionCategory;
};

/**
 * Applies an option's changes, so a preview and the real thing cannot diverge.
 * The library is passed in because a swap needs the replacement's price.
 */
export function applyRecoveryOption(
  draft: WorkingDraft,
  option: Pick<RecoveryOption, "changes">,
  library: CatalogProduct[],
): WorkingDraft {
  const byVariation = new Map(library.map((product) => [product.variationId, product]));

  return option.changes.reduce((current, change) => {
    switch (change.type) {
      case "make-optional":
        return setItemOptions(current, change.itemId, { optional: true });

      case "make-flexible":
        return setItemOptions(current, change.itemId, {
          quantityEditable: true,
          quantityMin: change.min,
          quantityMax: change.max,
        });

      case "discount":
        return setItemDiscount(current, change.itemId, {
          type: "percent",
          value: change.percent,
        });

      case "swap": {
        const product = byVariation.get(change.toVariationId);
        if (!product) return current;

        // Swapping keeps the line in place and changes the product on it, so
        // quantity, role and flexibility survive the exchange.
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === change.itemId
              ? {
                  ...item,
                  productId: product.productId,
                  variationId: product.variationId,
                  title: product.title,
                  unit: product.unit,
                  contentType: product.contentType,
                  unitPriceMinor: product.unitPriceMinor,
                  vatRate: product.vatRate,
                  currency: product.currency,
                }
              : item,
          ),
        };
      }
    }
  }, draft);
}

function totalsAfter(
  draft: WorkingDraft,
  changes: RecoveryChange[],
  library: CatalogProduct[],
) {
  return calculateTotals(applyRecoveryOption(draft, { changes }, library));
}

/** Option 1 — concede nothing on price: soften the commitment instead. */
function buildRestructure(input: RecoveryInput): RecoveryOption | null {
  const { draft } = input;
  const changes: RecoveryChange[] = [];
  const detail: string[] = [];

  for (const item of draft.items) {
    if (item.role === "addon" && !item.optional) {
      changes.push({ type: "make-optional", itemId: item.id, title: item.title });
      detail.push(`Make ${item.title} optional, so they only pay for it if they want it`);
    }
  }

  for (const item of draft.items) {
    if (item.unit !== "person" || item.quantityEditable) continue;

    const min = Math.max(1, Math.floor(item.quantity * 0.8));
    changes.push({ type: "make-flexible", itemId: item.id, title: item.title, min, max: item.quantity });
    detail.push(`Let them set ${item.title} between ${min} and ${item.quantity}`);
  }

  if (changes.length === 0) return null;

  const after = totalsAfter(draft, changes, input.library);
  const before = calculateTotals(draft);

  return {
    kind: "restructure",
    title: "Keep the price, soften the commitment",
    detail,
    changes,
    committedInclVatMinor: after.inclVatMinor,
    deltaInclVatMinor: after.inclVatMinor - before.inclVatMinor,
    currency: before.currency,
  };
}

/**
 * How far below the current price an alternative may sit.
 *
 * Type and unit alone are not enough to make two products substitutes: a
 * welcome reception and a lunch buffet are both food priced per person, but
 * one does not replace the other. A floor on the ratio keeps swaps to genuine
 * like-for-like trades rather than quietly downgrading the offer.
 */
const MIN_ALTERNATIVE_RATIO = 0.6;

/** Option 2 — same shape of offer, cheaper products from the library. */
function buildAlternatives(input: RecoveryInput): RecoveryOption | null {
  const { draft, library } = input;
  const changes: RecoveryChange[] = [];
  const detail: string[] = [];

  for (const item of draft.items) {
    const cheaper = library
      .filter(
        (product) =>
          product.contentType === item.contentType &&
          product.unit === item.unit &&
          product.variationId !== item.variationId &&
          product.unitPriceMinor < item.unitPriceMinor &&
          product.unitPriceMinor >= item.unitPriceMinor * MIN_ALTERNATIVE_RATIO,
      )
      .sort((a, b) => b.unitPriceMinor - a.unitPriceMinor)[0];

    if (!cheaper) continue;

    const saving = (item.unitPriceMinor - cheaper.unitPriceMinor) / 100;
    changes.push({
      type: "swap",
      itemId: item.id,
      title: item.title,
      toVariationId: cheaper.variationId,
      toTitle: cheaper.title,
    });
    detail.push(
      `${item.title} → ${cheaper.title}, saving ${saving.toFixed(2)} ${item.currency} per ${item.unit}`,
    );
  }

  if (changes.length === 0) return null;

  const after = totalsAfter(draft, changes, library);
  const before = calculateTotals(draft);

  return {
    kind: "alternatives",
    title: "Cheaper products, same shape",
    detail,
    changes,
    committedInclVatMinor: after.inclVatMinor,
    deltaInclVatMinor: after.inclVatMinor - before.inclVatMinor,
    currency: before.currency,
  };
}

/** Option 3 — the real concession, always inside policy. */
function buildDiscount(input: RecoveryInput): RecoveryOption | null {
  const { draft, policy } = input;
  const changes: RecoveryChange[] = [];
  const detail: string[] = [];

  for (const item of draft.items) {
    if (item.role === "addon" && !policy.allowDiscountOnAddons) continue;

    const percent = maxPercentFor(item, policy);
    if (percent <= 0) continue;

    changes.push({ type: "discount", itemId: item.id, title: item.title, percent });

    const floor = policy.floorUnitPriceMinorByType[item.contentType];
    const after = Math.round(item.unitPriceMinor * (1 - percent));
    detail.push(
      `${Math.round(percent * 100)}% off ${item.title} — ` +
        `${(after / 100).toFixed(2)} ${item.currency} per ${item.unit}, ` +
        `${((after - floor) / 100).toFixed(2)} above the floor`,
    );
  }

  if (changes.length === 0) return null;

  const after = totalsAfter(draft, changes, input.library);
  const before = calculateTotals(draft);

  return {
    kind: "discount",
    title: "Reduce the rate, within policy",
    detail,
    changes,
    committedInclVatMinor: after.inclVatMinor,
    deltaInclVatMinor: after.inclVatMinor - before.inclVatMinor,
    currency: before.currency,
  };
}

/**
 * At most three options, least concessive first.
 *
 * With no stated reason the discount is withheld: guessing that price was the
 * problem and leading with money is exactly what SPEC D15 warns against.
 */
export function buildRecoveryOptions(input: RecoveryInput): RecoveryOption[] {
  const options = [buildRestructure(input), buildAlternatives(input)];

  if (input.category !== "no_reason") options.push(buildDiscount(input));

  return options.filter((option): option is RecoveryOption => option !== null).slice(0, 3);
}
