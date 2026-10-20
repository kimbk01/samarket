/**
 * V3-04 DEF-7 — owner submit uses the atomic debit + transition writer option;
 * legacy debit → transition only when the DB function is missing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionOwnerBannerCampaign = vi.fn();
const transitionOwnerSponsoredCampaign = vi.fn();
const debitBusinessCashForDeliveryAd = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true }),
  getStoreIfOwnerForOperationalWrite: async () => ({ ok: true }),
}));
vi.mock("@/lib/stores/advertising/owner-banner-writer", () => ({
  loadOwnerBannerCampaign: async () => ({
    ok: true,
    row: { storeId: "store-1", pricingModel: "pkg-1", inventoryKeys: ["STORES_HOME_HERO"] },
  }),
  transitionOwnerBannerCampaign: (...a: unknown[]) => transitionOwnerBannerCampaign(...a),
}));
vi.mock("@/lib/stores/advertising/owner-store-sponsored-writer", () => ({
  loadOwnerSponsoredCampaign: async () => ({
    ok: true,
    row: { storeId: "store-1", pricingModel: "pkg-1", inventoryKeys: ["STORES_HOME_TOP"] },
  }),
  transitionOwnerSponsoredCampaign: (...a: unknown[]) => transitionOwnerSponsoredCampaign(...a),
}));
vi.mock("@/lib/stores/advertising/owner-delivery-ad-commercial-bind", () => ({
  attachOwnerPaidCommercialSnapshotOnSubmit: async () => ({ ok: true }),
  decodeOwnerAdPackagePricingModel: (v: string) => v,
}));
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => ({
  debitBusinessCashForDeliveryAd: (...a: unknown[]) => debitBusinessCashForDeliveryAd(...a),
}));

import { POST } from "@/app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("https://x.test/api/me/stores/store-1/delivery-ads/camp-1/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "store-1", campaignId: "camp-1" }) }
  );
}

beforeEach(() => vi.clearAllMocks());

describe("owner delivery-ad submit — atomic debit + transition", () => {
  it("banner submit passes secureBusinessCash and never debits separately", async () => {
    transitionOwnerBannerCampaign.mockResolvedValue({ ok: true, row: { id: "camp-1" } });
    const res = await call({ action: "submit", productKind: "banner" });
    expect(res.status).toBe(200);
    expect(transitionOwnerBannerCampaign).toHaveBeenCalledWith(expect.anything(), {
      campaignId: "camp-1",
      ownerUserId: "owner-1",
      action: "submit",
      secureBusinessCash: { storeId: "store-1" },
    });
    expect(debitBusinessCashForDeliveryAd).not.toHaveBeenCalled();
  });

  it("insufficient cash from the atomic path → 402 with amounts", async () => {
    transitionOwnerSponsoredCampaign.mockResolvedValue({
      ok: false,
      error: "business_cash_failed",
      cash: {
        ok: false,
        error: "INSUFFICIENT_BUSINESS_CASH",
        insufficient: {
          error: "INSUFFICIENT_BUSINESS_CASH",
          availableMinor: 100,
          requiredMinor: 500,
          shortageMinor: 400,
          availablePhp: 1,
          requiredPhp: 5,
          shortagePhp: 4,
          currency: "PHP",
        },
      },
    });
    const res = await call({ action: "resubmit" });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "INSUFFICIENT_BUSINESS_CASH", shortageMinor: 400 });
  });

  it("transition failure from the atomic path keeps 409 mapping", async () => {
    transitionOwnerSponsoredCampaign.mockResolvedValue({ ok: false, error: "duplicate_submit" });
    const res = await call({ action: "submit" });
    expect(res.status).toBe(409);
    expect(debitBusinessCashForDeliveryAd).not.toHaveBeenCalled();
  });

  it("atomic RPC missing → 503 without a separate debit or second transition (V3-04, no 2-step fallback)", async () => {
    transitionOwnerSponsoredCampaign.mockResolvedValueOnce({ ok: false, error: "atomic_submit_rpc_missing" });
    const res = await call({ action: "submit" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "atomic_submit_rpc_missing" });
    expect(debitBusinessCashForDeliveryAd).not.toHaveBeenCalled();
    expect(transitionOwnerSponsoredCampaign).toHaveBeenCalledTimes(1);
  });

  it("pause does not request cash securing", async () => {
    transitionOwnerSponsoredCampaign.mockResolvedValue({ ok: true, row: { id: "camp-1" } });
    await call({ action: "pause" });
    expect(transitionOwnerSponsoredCampaign.mock.calls[0][1]).not.toHaveProperty("secureBusinessCash");
  });
});
