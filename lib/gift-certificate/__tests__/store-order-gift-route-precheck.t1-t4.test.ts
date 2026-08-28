import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { giftInstanceAllowsCheckoutStore } from "@/lib/gift-certificate/gift-certificate-domain-contract";

const STORE_X = "19085860-52d2-4183-b033-e71fcb58bcec";
const STORE_Y = "00000000-0000-4000-8000-000000000099";

describe("store-order gift route precheck — PLATFORM first-divergence (T1–T4)", () => {
  it("T1 STORE / same store: ALLOW", () => {
    expect(
      giftInstanceAllowsCheckoutStore({
        giftScope: "STORE",
        instanceStoreId: STORE_X,
        checkoutStoreId: STORE_X,
      })
    ).toBe(true);
  });

  it("T2 STORE / other store: BLOCK", () => {
    expect(
      giftInstanceAllowsCheckoutStore({
        giftScope: "STORE",
        instanceStoreId: STORE_X,
        checkoutStoreId: STORE_Y,
      })
    ).toBe(false);
  });

  it("T3 PLATFORM / eligible store: ALLOW (instance store_id null)", () => {
    expect(
      giftInstanceAllowsCheckoutStore({
        giftScope: "PLATFORM",
        instanceStoreId: null,
        checkoutStoreId: STORE_X,
      })
    ).toBe(true);
  });

  it("T4 malformed scope: FAIL CLOSED (unknown → STORE w/o store id)", () => {
    expect(
      giftInstanceAllowsCheckoutStore({
        giftScope: "UNKNOWN",
        instanceStoreId: null,
        checkoutStoreId: STORE_X,
      })
    ).toBe(false);
  });

  it("route uses scope-aware giftInstanceAllowsCheckoutStore (not naive store_id equality)", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(route).toContain("giftInstanceAllowsCheckoutStore");
    expect(route).toContain("gift_scope");
    expect(route).not.toMatch(/if\s*\(\s*String\(row\.store_id\)\s*!==\s*storeId\s*\)/);
  });
});
