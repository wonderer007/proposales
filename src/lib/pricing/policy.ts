import type { ContentType } from "@/lib/proposales/schemas";

/**
 * What the hotel is willing to concede on price (SPEC §6.6).
 *
 * The agent may propose a reduction within these limits and never outside
 * them; the server validates every discount before it reaches a proposal.
 *
 * The numbers below are starting values for the demo property — review them
 * against real margins before using this for anything that matters.
 */
export type PricingPolicy = {
  /** Largest percentage reduction, 0–1. */
  maxPercentDiscount: number;
  /** Lowest acceptable unit price excluding VAT, in minor units, by type. */
  floorUnitPriceMinorByType: Record<ContentType, number>;
  /** Add-ons are already optional; discounting them erodes margin for nothing. */
  allowDiscountOnAddons: boolean;
  /** A reduction the customer can see should say why. */
  requireCommentOnDiscount: boolean;
};

export const PRICING_POLICY: PricingPolicy = {
  maxPercentDiscount: 0.15,
  floorUnitPriceMinorByType: {
    meetingRoom: 40_000,
    food: 2_500,
    accommodation: 15_000,
    other: 1_000,
  },
  allowDiscountOnAddons: false,
  requireCommentOnDiscount: true,
};

export function getPricingPolicy(): PricingPolicy {
  return PRICING_POLICY;
}
