/**
 * 5-C BR-02 — 라우트가 넘긴 scopeMeta 가 있으면 삽입 메타는 정책 행을 다시 읽지 않고,
 * 삽입 정책(광고 슬롯)도 같은 scopeMeta 값으로 만든다. 없으면 기존대로 조회.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPolicy = vi.fn(async () => []);
vi.mock("@/lib/stores/product/stores-browse-scope-policy-db", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, listBrowseScopePolicyRows: () => listPolicy() };
});
vi.mock("@/lib/stores/load-store-insertion-campaigns", () => ({
  loadActiveStorePaidAdCampaigns: async () => [],
  loadActiveStoreCouponCampaigns: async () => [],
}));

import { attachStoresBrowseInsertionMeta } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";

const body = { ok: true, stores: [{ id: "s1" }, { id: "s2" }], meta: {} } as never;
const scopeMeta = {
  primarySlug: "mart",
  subSlug: "meat",
  enabled: true,
  displayTitleKo: null,
  displayTitleEn: null,
  adEnabled: true,
  couponEnabled: false,
  maxInsertion: 2,
  intervalEveryN: 3,
  presentationMode: "card_benefit_integrated",
  cardType: "store",
  defaultSort: "default",
  popularityWindowDays: 30,
  rankingCriteria: [],
  customerSortAvailability: { popular: true, rating: true, distance: true },
  discoveryShelf: { enabled: false },
} as never;

describe("5-C BR-02 insertion meta scopeMeta reuse", () => {
  beforeEach(() => listPolicy.mockClear());

  it("scopeMeta 전달 → 정책 행 조회 0, 광고 슬롯 허용은 scopeMeta.adEnabled", async () => {
    const out = (await attachStoresBrowseInsertionMeta({} as never, body, {
      primarySlug: "mart",
      subSlug: "meat",
      viewerUserId: null,
      scopeMeta,
    })) as { meta: { browseInsertion: { surfaceAllowed: boolean; organicIds: string[] }; browseScopePolicy: { subSlug: string } } };
    expect(listPolicy).not.toHaveBeenCalled();
    expect(out.meta.browseInsertion.surfaceAllowed).toBe(true);
    expect(out.meta.browseInsertion.organicIds).toEqual(["s1", "s2"]);
    expect(out.meta.browseScopePolicy.subSlug).toBe("meat");
  });

  it("scopeMeta.enabled=false → 자연 목록 비움 (운영자 차단 게이트 유지)", async () => {
    const out = (await attachStoresBrowseInsertionMeta({} as never, body, {
      primarySlug: "mart",
      subSlug: "meat",
      scopeMeta: { ...(scopeMeta as object), enabled: false } as never,
    })) as { stores: unknown[] };
    expect(out.stores).toEqual([]);
    expect(listPolicy).not.toHaveBeenCalled();
  });

  it("scopeMeta 없음 → 기존대로 정책 조회", async () => {
    await attachStoresBrowseInsertionMeta({} as never, body, { primarySlug: "mart", subSlug: "meat" });
    expect(listPolicy).toHaveBeenCalled();
  });
});
