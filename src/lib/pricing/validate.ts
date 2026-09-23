import type { Discount, DraftItem } from "@/lib/builder/draft";
import { formatMoney } from "@/lib/builder/totals";
import type { PricingPolicy } from "./policy";

/**
 * Checks a discount against the pricing policy (SPEC §6.6).
 *
 * Returns every violation rather than the first, so a manager sees the whole
 * picture. A violation is not automatically fatal: the manager may proceed by
 * supplying an override reason, which is stored in the snapshot.
 */
export type DiscountViolation =
  | { kind: "over-max-percent"; message: string }
  | { kind: "below-floor"; message: string }
  | { kind: "addon-not-allowed"; message: string };

export type DiscountValidation = {
  /** True when the discount is within policy and needs no override. */
  allowed: boolean;
  violations: DiscountViolation[];
  /** Separate from violations: an override cannot excuse a missing comment. */
  missingComment: boolean;
  /** Unit price after the reduction, excluding VAT, in minor units. */
  unitPriceAfterMinor: number;
};

/** The unit price left after a discount, excluding VAT. */
export function unitPriceAfterDiscount(item: DraftItem, discount: Discount): number {
  if (discount.type === "percent") {
    return Math.max(0, Math.round(item.unitPriceMinor * (1 - discount.value)));
  }

  // A fixed discount applies to the line, so spread it across the units to
  // compare against a per-unit floor.
  const perUnit = item.quantity > 0 ? discount.value / item.quantity : discount.value;

  return Math.max(0, Math.round(item.unitPriceMinor - perUnit));
}

export function validateDiscount(
  item: DraftItem,
  discount: Discount,
  policy: PricingPolicy,
): DiscountValidation {
  const violations: DiscountViolation[] = [];
  const unitPriceAfterMinor = unitPriceAfterDiscount(item, discount);

  if (discount.type === "percent" && discount.value > policy.maxPercentDiscount) {
    violations.push({
      kind: "over-max-percent",
      message:
        `${Math.round(discount.value * 100)}% is above the ` +
        `${Math.round(policy.maxPercentDiscount * 100)}% limit.`,
    });
  }

  const floor = policy.floorUnitPriceMinorByType[item.contentType];
  if (unitPriceAfterMinor < floor) {
    violations.push({
      kind: "below-floor",
      message:
        `${formatMoney(unitPriceAfterMinor, item.currency)} per ${item.unit} is below the ` +
        `floor of ${formatMoney(floor, item.currency)}.`,
    });
  }

  if (!policy.allowDiscountOnAddons && item.role === "addon") {
    violations.push({
      kind: "addon-not-allowed",
      message: `"${item.title}" is an add-on; the policy does not allow discounting those.`,
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
    missingComment: policy.requireCommentOnDiscount && !item.comment,
    unitPriceAfterMinor,
  };
}

/** The largest percentage this item can take before hitting the floor. */
export function maxPercentFor(item: DraftItem, policy: PricingPolicy): number {
  const floor = policy.floorUnitPriceMinorByType[item.contentType];
  if (item.unitPriceMinor <= 0) return 0;

  const toFloor = Math.max(0, 1 - floor / item.unitPriceMinor);

  return Math.min(policy.maxPercentDiscount, Math.floor(toFloor * 100) / 100);
}
