import { db } from "@/lib/db/client";
import { contentCatalog } from "@/lib/db/schema";
import { listContent } from "@/lib/proposales/client";
import { configuredCompanyId } from "@/lib/proposales/company";
import { pickLocalized } from "@/lib/proposales/schemas";
import type { CatalogProduct } from "@/lib/builder/draft";

/**
 * The hotel's sellable products: the live Proposales library joined to the
 * local pricing catalog on `variation_id`.
 *
 * The content API stores no price, unit, VAT or type, so a product without a
 * catalog row cannot be quoted and is left out — which is also what keeps the
 * agent from referencing something it cannot price.
 */

export type LibraryProduct = CatalogProduct & { description: string };

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { products: LibraryProduct[]; expiresAt: number } | null = null;

export async function getContentLibrary(
  { force = false }: { force?: boolean } = {},
): Promise<LibraryProduct[]> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.products;

  const companyId = configuredCompanyId();
  const [live, pricing] = await Promise.all([
    listContent({ companyId }),
    db.select().from(contentCatalog),
  ]);

  const byVariation = new Map(pricing.map((row) => [row.variationId, row]));

  const products = live.flatMap<LibraryProduct>((item) => {
    const priced = byVariation.get(item.variation_id);
    if (!priced) return [];

    return [
      {
        productId: item.product_id,
        variationId: item.variation_id,
        title: pickLocalized(item.title, "en"),
        description: pickLocalized(item.description, "en"),
        unit: priced.unit,
        contentType: priced.contentType,
        unitPriceMinor: priced.unitPriceMinor,
        vatRate: priced.vatRate,
        currency: priced.currency,
      },
    ];
  });

  cache = { products, expiresAt: Date.now() + CACHE_TTL_MS };

  return products;
}

/** Variation ids currently sellable, for readiness checks. */
export async function getKnownVariationIds(): Promise<Set<number>> {
  return new Set((await getContentLibrary()).map((product) => product.variationId));
}

export function clearContentLibraryCache(): void {
  cache = null;
}
