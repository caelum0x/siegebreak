import { describe, it, expect } from "vitest";
import { gemsForProduct, listProducts } from "../src/modules/economy/products";

describe("gemsForProduct", () => {
  it("returns the configured gems for a known product", () => {
    expect(gemsForProduct("gems_small")).toBe(100);
    expect(gemsForProduct("gems_mega")).toBe(2500);
  });

  it("returns null for an unknown product rather than a zero grant", () => {
    expect(gemsForProduct("gems_free_lol")).toBeNull();
  });

  it("does not treat inherited object props as products", () => {
    // Guards against a prototype-pollution style lookup ("toString", etc.).
    expect(gemsForProduct("toString")).toBeNull();
    expect(gemsForProduct("constructor")).toBeNull();
  });
});

describe("listProducts", () => {
  it("returns the full catalog as {productId, gems} entries", () => {
    const products = listProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(typeof p.productId).toBe("string");
      expect(typeof p.gems).toBe("number");
    }
    expect(products).toContainEqual({ productId: "gems_small", gems: 100 });
  });
});
