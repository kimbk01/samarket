/**
 * finance-ssot-19 — Gift instance validity window at checkout.
 * Mirrors SQL (20261128200000):
 *   expired       ≡ valid_until IS NOT NULL AND valid_until < (now() AT TIME ZONE 'Asia/Manila')::date
 *   not yet valid ≡ valid_from  IS NOT NULL AND valid_from  > (now() AT TIME ZONE 'Asia/Manila')::date
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  giftInstanceValidityError,
  giftManilaTodayYmd,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  filterCheckoutEligibleGifts,
  isCheckoutEligibleGiftInstance,
} from "@/lib/gift-certificate/checkout-eligible-gifts";
import type { GiftWalletInstance } from "@/lib/gift-certificate/load-gift-wallet";
import { resolveStoreCheckoutClientError } from "@/lib/stores/resolve-store-checkout-client-error";

// 2026-10-12T17:30:00Z = 2026-10-13 01:30 in Manila (UTC+8) — Manila date differs from UTC date.
const NOW = new Date("2026-10-12T17:30:00.000Z");

function inst(partial: Partial<GiftWalletInstance> = {}): GiftWalletInstance {
  return {
    id: "g1",
    productId: "p1",
    giftScope: "STORE",
    storeId: "store-a",
    storeName: "Store",
    title: "Gift",
    imageUrl: null,
    transferable: true,
    faceValue: 1000,
    purchasePrice: 1000,
    remainingBalance: 1000,
    status: "ACTIVE",
    purchasedAt: "2026-01-01",
    fullyRedeemedAt: null,
    validFrom: null,
    validUntil: null,
    ...partial,
  };
}

describe("giftManilaTodayYmd / giftInstanceValidityError", () => {
  it("uses Asia/Manila calendar date, not UTC", () => {
    expect(giftManilaTodayYmd(NOW)).toBe("2026-10-13");
  });

  it("valid_until null → never expired", () => {
    expect(giftInstanceValidityError({ validFrom: "2026-01-01", validUntil: null }, NOW)).toBeNull();
  });

  it("valid_until == Manila today → still valid (inclusive)", () => {
    expect(giftInstanceValidityError({ validFrom: null, validUntil: "2026-10-13" }, NOW)).toBeNull();
  });

  it("valid_until < Manila today → gift_expired (even if == UTC date)", () => {
    expect(giftInstanceValidityError({ validFrom: null, validUntil: "2026-10-12" }, NOW)).toBe("gift_expired");
  });

  it("valid_from == Manila today → valid (inclusive)", () => {
    expect(giftInstanceValidityError({ validFrom: "2026-10-13", validUntil: null }, NOW)).toBeNull();
  });

  it("valid_from > Manila today → gift_not_yet_valid", () => {
    expect(giftInstanceValidityError({ validFrom: "2026-10-14", validUntil: null }, NOW)).toBe(
      "gift_not_yet_valid"
    );
  });

  it("accepts timestamp-ish strings by date prefix", () => {
    expect(giftInstanceValidityError({ validFrom: null, validUntil: "2026-10-12T23:59:59" }, NOW)).toBe(
      "gift_expired"
    );
  });
});

describe("isCheckoutEligibleGiftInstance — validity window", () => {
  it("allows null valid_until", () => {
    expect(isCheckoutEligibleGiftInstance(inst({ validUntil: null }), "store-a", { now: NOW })).toBe(true);
  });

  it("excludes expired", () => {
    expect(isCheckoutEligibleGiftInstance(inst({ validUntil: "2026-10-12" }), "store-a", { now: NOW })).toBe(
      false
    );
  });

  it("excludes not-yet-valid", () => {
    expect(isCheckoutEligibleGiftInstance(inst({ validFrom: "2026-10-20" }), "store-a", { now: NOW })).toBe(
      false
    );
  });

  it("filterCheckoutEligibleGifts drops expired / not-yet-valid only", () => {
    const out = filterCheckoutEligibleGifts(
      [
        inst({ id: "ok", validFrom: "2026-10-01", validUntil: "2026-12-31" }),
        inst({ id: "expired", validUntil: "2026-10-01" }),
        inst({ id: "future", validFrom: "2027-01-01" }),
        inst({ id: "open", validUntil: null }),
      ],
      "store-a",
      { now: NOW }
    );
    expect(out.map((g) => g.instanceId)).toEqual(["ok", "open"]);
  });
});

describe("client error i18n mapping", () => {
  it("maps gift_expired / gift_not_yet_valid to dedicated keys", () => {
    const t = (k: string) => k;
    expect(resolveStoreCheckoutClientError(t as never, "gift_expired")).toBe("gift_u4_err_expired");
    expect(resolveStoreCheckoutClientError(t as never, "gift_not_yet_valid")).toBe("gift_u4_err_not_yet_valid");
  });
});

/* ── POST /api/me/store-orders gift precheck ───────────────────────────────── */
const tryGetSupabaseForStores = vi.fn();
const createStoreOrderAtomic = vi.fn();
const validateStoreOrderCheckout = vi.fn();
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "buyer-1" }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true, profile: { id: "buyer-1" } }),
}));
vi.mock("@/lib/auth/member-account-state", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isProductWriteDeniedMemberAccount: () => false,
}));
vi.mock("@/lib/auth/require-signup-complete-api", () => ({
  requireSignupCompleteForUser: async () => ({ ok: true }),
}));
vi.mock("@/lib/profile/require-profile-completion.server", () => ({
  requireProfileFieldsForAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => tryGetSupabaseForStores(),
}));
vi.mock("@/lib/stores/validate-store-order-checkout", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  validateStoreOrderCheckout: (...a: unknown[]) => validateStoreOrderCheckout(...a),
}));
vi.mock("@/lib/stores/create-store-order-atomic", () => ({
  createStoreOrderAtomic: (...a: unknown[]) => createStoreOrderAtomic(...a),
}));

function storeOrdersSb(gift: Record<string, unknown>) {
  const selects: string[] = [];
  return {
    selects,
    sb: {
      from: (table: string) => {
        const api: Record<string, unknown> = {
          select: (cols: string) => {
            selects.push(`${table}:${cols}`);
            return api;
          },
          eq: () => api,
          maybeSingle: async () => {
            if (table === "stores") {
              return {
                data: {
                  id: "store-a",
                  owner_user_id: "owner-1",
                  approval_status: "approved",
                  is_visible: true,
                  store_name: "S",
                  is_open: true,
                  business_hours_json: null,
                },
                error: null,
              };
            }
            if (table === "gift_certificate_instances") return { data: gift, error: null };
            return { data: null, error: null };
          },
        };
        return api;
      },
    },
  };
}

function orderReq() {
  return new Request("http://x/api/me/store-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      store_id: "store-a",
      items: [{ product_id: "prod-1", qty: 1 }],
      gift_instance_ids: ["g1"],
    }),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/me/store-orders — gift validity precheck before RPC", () => {
  beforeEach(() => {
    createStoreOrderAtomic.mockReset();
    validateStoreOrderCheckout.mockReset();
    validateStoreOrderCheckout.mockResolvedValue({
      ok: true,
      lines: [],
      deliveryFeeAmount: 0,
      paymentGrandTotal: 500,
      paymentTotal: 500,
      productsById: new Map(),
    });
    createStoreOrderAtomic.mockResolvedValue({
      ok: false,
      error: "should_not_be_called",
      httpStatus: 500,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  const baseGift = {
    id: "g1",
    store_id: "store-a",
    gift_scope: "STORE",
    current_owner_user_id: "buyer-1",
    remaining_balance: 1000,
    status: "ACTIVE",
    valid_from: "2026-01-01",
    valid_until: null as string | null,
  };

  it("expired gift → 400 gift_expired, RPC not called", async () => {
    const { sb, selects } = storeOrdersSb({ ...baseGift, valid_until: "2026-10-12" });
    tryGetSupabaseForStores.mockReturnValue(sb);
    const { POST } = await import("@/app/api/me/store-orders/route");
    const res = await POST(orderReq());
    vi.useRealTimers();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "gift_expired" });
    expect(createStoreOrderAtomic).not.toHaveBeenCalled();
    expect(selects.find((s) => s.startsWith("gift_certificate_instances:"))).toMatch(/valid_from.*valid_until/);
  });

  it("not-yet-valid gift → 400 gift_not_yet_valid, RPC not called", async () => {
    const { sb } = storeOrdersSb({ ...baseGift, valid_from: "2026-10-14" });
    tryGetSupabaseForStores.mockReturnValue(sb);
    const { POST } = await import("@/app/api/me/store-orders/route");
    const res = await POST(orderReq());
    vi.useRealTimers();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "gift_not_yet_valid" });
    expect(createStoreOrderAtomic).not.toHaveBeenCalled();
  });

  it("route source: validity check precedes createStoreOrderAtomic", () => {
    vi.useRealTimers();
    const src = readFileSync(resolve(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    const iCheck = src.indexOf("giftInstanceValidityError(");
    const iRpc = src.indexOf("await createStoreOrderAtomic(sb");
    expect(iCheck).toBeGreaterThan(0);
    expect(iRpc).toBeGreaterThan(iCheck);
    void NextResponse;
  });
});
