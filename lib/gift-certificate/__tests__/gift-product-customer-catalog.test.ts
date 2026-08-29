import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateGiftProductCustomerPurchaseEligibility,
  isGiftProductCustomerCatalogEligible,
} from "@/lib/gift-certificate/gift-product-customer-catalog";

const NOW = Date.parse("2026-08-28T12:00:00.000Z");

const BASE = {
  active: true,
  mall_visible: true,
  archived_at: null as string | null,
  sales_starts_at: "2026-01-01T00:00:00.000Z",
  sales_ends_at: null as string | null,
  max_issuance: null as number | null,
  issued_count: 0,
};

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift-product-customer-catalog SSOT", () => {
  it("T1 eligible when active+visible+in-window+under-cap", () => {
    const e = evaluateGiftProductCustomerPurchaseEligibility(BASE, NOW);
    expect(e).toEqual({ eligible: true, reason: null });
    expect(isGiftProductCustomerCatalogEligible(BASE, NOW)).toBe(true);
  });

  it("T2 mall_visible=false → mall_hidden", () => {
    expect(evaluateGiftProductCustomerPurchaseEligibility({ ...BASE, mall_visible: false }, NOW)).toEqual({
      eligible: false,
      reason: "mall_hidden",
    });
  });

  it("T3 active=false → paused", () => {
    expect(evaluateGiftProductCustomerPurchaseEligibility({ ...BASE, active: false }, NOW)).toEqual({
      eligible: false,
      reason: "paused",
    });
  });

  it("T4 archived → archived", () => {
    expect(
      evaluateGiftProductCustomerPurchaseEligibility(
        { ...BASE, archived_at: "2026-08-01T00:00:00.000Z" },
        NOW
      )
    ).toEqual({ eligible: false, reason: "archived" });
  });

  it("T5 before sales start", () => {
    expect(
      evaluateGiftProductCustomerPurchaseEligibility(
        { ...BASE, sales_starts_at: "2026-12-01T00:00:00.000Z" },
        NOW
      )
    ).toEqual({ eligible: false, reason: "before_sales_start" });
  });

  it("T6 after sales end (exclusive end matches purchase RPC)", () => {
    expect(
      evaluateGiftProductCustomerPurchaseEligibility(
        { ...BASE, sales_ends_at: "2026-08-28T12:00:00.000Z" },
        NOW
      )
    ).toEqual({ eligible: false, reason: "after_sales_end" });
    expect(
      evaluateGiftProductCustomerPurchaseEligibility(
        { ...BASE, sales_ends_at: "2026-08-28T12:00:01.000Z" },
        NOW
      )
    ).toEqual({ eligible: true, reason: null });
  });

  it("T7 issuance cap reached", () => {
    expect(
      evaluateGiftProductCustomerPurchaseEligibility(
        { ...BASE, max_issuance: 10, issued_count: 10 },
        NOW
      )
    ).toEqual({ eligible: false, reason: "issuance_cap_reached" });
    expect(
      evaluateGiftProductCustomerPurchaseEligibility(
        { ...BASE, max_issuance: 10, issued_count: 9 },
        NOW
      )
    ).toEqual({ eligible: true, reason: null });
  });

  it("mall loader + purchase migration share mall_visible + cap semantics", () => {
    const mall = source("lib/gift-certificate/load-gift-mall-products.ts");
    const mig = source(
      "supabase/migrations/20261129230000_gift_certificate_purchase_mall_visible_gate.sql"
    );
    const catalog = source("lib/gift-certificate/gift-product-customer-catalog.ts");
    expect(mall).toContain("isGiftProductCustomerCatalogEligible");
    expect(mall).toContain("loadGiftMallProductById");
    expect(mall).toContain("max_issuance");
    expect(mall).toContain("mall_visible");
    expect(mall).toContain("sales_ends_at.gt.");
    expect(catalog).toContain("issuance_cap_reached");
    expect(catalog).toContain("mall_hidden");
    expect(mig).toContain("product_mall_hidden");
    expect(mig).toContain("mall_visible");
    expect(mall).not.toContain("isCustomerOpaqueGiftProductTitle");
  });

  it("T9 admin products GET exposes mall_visible + customer purchasable", () => {
    const admin = source("app/api/admin/gift-certificates/products/route.ts");
    expect(admin).toContain("mall_visible");
    expect(admin).toContain("customer_purchasable");
    expect(admin).toContain("evaluateGiftProductCustomerPurchaseEligibility");
  });
});
