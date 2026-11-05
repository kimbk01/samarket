/**
 * iOS 앱 — Cash 광고 결제(submit/resubmit)는 차감 전에 403, 관리 동작(pause 등)·Android 는 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionOwnerBannerCampaign = vi.fn();
const transitionOwnerSponsoredCampaign = vi.fn();
const attachCommercial = vi.fn();

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
  attachOwnerPaidCommercialSnapshotOnSubmit: (...a: unknown[]) => attachCommercial(...a),
  decodeOwnerAdPackagePricingModel: (v: string) => v,
}));

import { POST } from "@/app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route";

const IOS_APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_APP_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.86 Mobile Safari/537.36";

function call(body: Record<string, unknown>, headers: Record<string, string>) {
  return POST(
    new Request("https://x.test/api/me/stores/store-1/delivery-ads/camp-1/actions", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "store-1", campaignId: "camp-1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  attachCommercial.mockResolvedValue({ ok: true });
  transitionOwnerBannerCampaign.mockResolvedValue({ ok: true, row: { id: "camp-1" } });
  transitionOwnerSponsoredCampaign.mockResolvedValue({ ok: true, row: { id: "camp-1" } });
});

describe("owner delivery-ad actions — iOS app Cash payment block", () => {
  it.each(["submit", "resubmit"])("iOS app %s → 403 before quote bind or Cash debit", async (action) => {
    for (const productKind of ["banner", "store_sponsored"]) {
      const res = await call({ action, productKind }, { "user-agent": IOS_APP_UA, cookie: "dibay_app=ios" });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: "ios_digital_purchase_unavailable" });
    }
    expect(attachCommercial).not.toHaveBeenCalled();
    expect(transitionOwnerBannerCampaign).not.toHaveBeenCalled();
    expect(transitionOwnerSponsoredCampaign).not.toHaveBeenCalled();
  });

  it("iOS app pause/resume/end still work (ad management kept)", async () => {
    for (const action of ["pause", "resume", "end"]) {
      const res = await call({ action }, { "user-agent": IOS_APP_UA, cookie: "dibay_app=ios", "x-dibay-shell": "ios" });
      expect(res.status).toBe(200);
    }
    expect(transitionOwnerSponsoredCampaign).toHaveBeenCalledTimes(3);
  });

  it("Android app submit unchanged (Cash secured in the atomic path)", async () => {
    const res = await call(
      { action: "submit", productKind: "banner" },
      { "user-agent": ANDROID_APP_UA, cookie: "dibay_app=android", "x-dibay-shell": "android" }
    );
    expect(res.status).toBe(200);
    expect(transitionOwnerBannerCampaign.mock.calls[0][1]).toMatchObject({ secureBusinessCash: { storeId: "store-1" } });
  });
});
