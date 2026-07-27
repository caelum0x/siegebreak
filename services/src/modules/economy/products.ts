// Server-authoritative product catalog. Gems granted for a purchase come from
// HERE, keyed by the productId read out of the *verified* store receipt — never
// from a client-supplied amount. An unknown productId grants nothing, so a
// receipt for a product we don't sell can't be turned into currency.

export interface Product {
  productId: string;
  gems: number;
}

// productId -> gems granted. These ids must match the products configured in
// App Store Connect / Google Play Console.
const CATALOG: Readonly<Record<string, number>> = Object.freeze({
  gems_small: 100,
  gems_medium: 550,
  gems_large: 1200,
  gems_mega: 2500,
});

// Gems for a product, or null if the id isn't in the catalog. Callers treat
// null as "invalid receipt" rather than a zero-gem grant.
export function gemsForProduct(productId: string): number | null {
  return Object.prototype.hasOwnProperty.call(CATALOG, productId)
    ? CATALOG[productId]
    : null;
}

export function listProducts(): Product[] {
  return Object.entries(CATALOG).map(([productId, gems]) => ({ productId, gems }));
}
