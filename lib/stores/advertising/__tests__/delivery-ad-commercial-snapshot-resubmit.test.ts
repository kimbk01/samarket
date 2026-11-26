/**
 * Stage 1 — commercial snapshot on submit / resubmit.
 * C-DB SA-02 (2026-11-27): TS 는 기록을 만들기만 하고, 저장(새로 또는 차감 안 된 옛 기록 갱신)은 제출 DB 함수가 한 트랜잭션에서 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteDeliveryAdApplicationCommercial = vi.fn();
const insertCampaignCommercialSnapshot = vi.fn();
const prepareOwnerPaidCampaignSnapshotFromQuote = vi.fn();

vi.mock("@/lib/stores/advertising/delivery-ad-commercial-catalog", () => ({
  quoteDeliveryAdApplicationCommercial: (...args: unknown[]) =>
    quoteDeliveryAdApplicationCommercial(...args),
  insertCampaignCommercialSnapshot: (...args: unknown[]) =>
    insertCampaignCommercialSnapshot(...args),
  prepareOwnerPaidCampaignSnapshotFromQuote: (...args: unknown[]) =>
    prepareOwnerPaidCampaignSnapshotFromQuote(...args),
}));

// No SECURED canonical funding in these scenarios (F-09 reuse path covered in
// delivery-ad-f09-funding-secured-guards.test.ts).
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => ({
  hasCanonicalBcFundingSecured: async () => false,
}));

import { attachOwnerPaidCommercialSnapshotOnSubmit } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

describe("commercial snapshot resubmit reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quoteDeliveryAdApplicationCommercial.mockResolvedValue({
      ok: true,
      finalPayableMinor: 12000,
      currency: "PHP",
      packageId: "pkg-1",
      packageCode: "7_day",
      packageDisplayName: "7 day",
      durationDays: 7,
      basePriceMinor: 12000,
      partnerMembershipId: null,
      partnerDiscountPercent: 0,
      partnerBenefit: null,
      pricedAt: new Date().toISOString(),
      commercialStatus: "PRICED",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      campaignSource: "OWNER_PAID",
    });
    prepareOwnerPaidCampaignSnapshotFromQuote.mockReturnValue({
      campaignId: "camp-1",
      productKind: "store_sponsored",
      packageId: "pkg-1",
      finalPayableMinor: 12000,
    });
  });

  it("C-DB SA-02: 요금 기록을 저장하지 않고 제출 DB 함수에 넘길 기록만 만든다 (재제출도 같음)", async () => {
    const res = await attachOwnerPaidCommercialSnapshotOnSubmit({} as never, {
      campaignId: "camp-1",
      storeId: "store-1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      packageId: "pkg-1",
      clientFinalPayableMinor: 12000,
      clientDurationDays: 7,
    });

    expect(res).toEqual({
      ok: true,
      finalPayableMinor: 12000,
      currency: "PHP",
      packageId: "pkg-1",
      snapshot: { campaignId: "camp-1", productKind: "store_sponsored", packageId: "pkg-1", finalPayableMinor: 12000 },
    });
    /** 저장은 DB 함수(차감·전이와 한 트랜잭션) — 차감 실패면 기록도 남지 않는다 */
    expect(insertCampaignCommercialSnapshot).not.toHaveBeenCalled();
  });

  it("화면 금액이 지금 견적과 다르면 quote_stale (기록 없음)", async () => {
    const res = await attachOwnerPaidCommercialSnapshotOnSubmit({} as never, {
      campaignId: "camp-1",
      storeId: "store-1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      packageId: "pkg-1",
      clientFinalPayableMinor: 99999,
      clientDurationDays: 7,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("quote_stale");
    expect(insertCampaignCommercialSnapshot).not.toHaveBeenCalled();
  });

  it("R-69: 화면 기간과 지금 상품 기간이 다르면 quote_stale(요금 기록 없음 · 차감 전)", async () => {
    const r = await attachOwnerPaidCommercialSnapshotOnSubmit({} as never, {
      campaignId: "camp-1",
      storeId: "store-1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      packageId: "pkg-1",
      clientFinalPayableMinor: 12000,
      clientDurationDays: 3,
    });
    expect(r).toMatchObject({ ok: false, error: "quote_stale", quoteError: "client_duration_mismatch" });
    expect(insertCampaignCommercialSnapshot).not.toHaveBeenCalled();
  });

  it("R-70: 견적 조회 오류는 「확인 못 함」(capacity_check_failed) — 「판매 안 함」이 아님", async () => {
    quoteDeliveryAdApplicationCommercial.mockRejectedValueOnce(new Error("db down"));
    const r = await attachOwnerPaidCommercialSnapshotOnSubmit({} as never, {
      campaignId: "camp-1",
      storeId: "store-1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      packageId: "pkg-1",
      clientFinalPayableMinor: 12000,
      clientDurationDays: 7,
    });
    expect(r).toMatchObject({ ok: false, error: "capacity_check_failed" });
    expect(insertCampaignCommercialSnapshot).not.toHaveBeenCalled();
  });
});
