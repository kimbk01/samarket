import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isGiftProductCustomerCatalogEligible } from "@/lib/gift-certificate/gift-product-customer-catalog";

const NOW = Date.parse("2026-08-28T12:00:00.000Z");

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift-product-customer-catalog", () => {
  it("allows active non-archived in-window products regardless of title", () => {
    expect(
      isGiftProductCustomerCatalogEligible(
        {
          active: true,
          archived_at: null,
          sales_starts_at: "2026-01-01T00:00:00.000Z",
          sales_ends_at: null,
        },
        NOW
      )
    ).toBe(true);
    expect(
      isGiftProductCustomerCatalogEligible(
        {
          active: true,
          archived_at: null,
          sales_starts_at: "2026-01-01T00:00:00.000Z",
          sales_ends_at: null,
        },
        NOW
      )
    ).toBe(true);
  });

  it("rejects inactive, archived, or outside sales window", () => {
    expect(
      isGiftProductCustomerCatalogEligible({ active: false, archived_at: null }, NOW)
    ).toBe(false);
    expect(
      isGiftProductCustomerCatalogEligible(
        { active: true, archived_at: "2026-08-01T00:00:00.000Z" },
        NOW
      )
    ).toBe(false);
    expect(
      isGiftProductCustomerCatalogEligible(
        {
          active: true,
          archived_at: null,
          sales_starts_at: "2026-12-01T00:00:00.000Z",
        },
        NOW
      )
    ).toBe(false);
  });

  it("mall loader uses lifecycle eligibility only — no title regex exclude", () => {
    const mall = source("lib/gift-certificate/load-gift-mall-products.ts");
    expect(mall).toContain("isGiftProductCustomerCatalogEligible");
    expect(mall).not.toContain("isCustomerOpaqueGiftProductTitle");
    expect(mall).not.toContain("customerTitle");
    expect(mall).not.toContain("gift-product-customer-view");
  });
});
