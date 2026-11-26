/**
 * 광고 요금 안내 재감사 2026-11-27 (G-1~G-8) — 화면 계약 시험.
 * 시안: docs/audit/ad-pricing-guide-redesign-mockup-2026-11-27.html
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getRouteUserId = vi.fn();
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: () => getRouteUserId() }));

const guideStub = {
  member: [],
  store: [],
  partner: null,
  storeHomeFeedOff: true,
  at: "2026-11-27T01:00:00.000Z",
};
vi.mock("@/lib/ads/ad-pricing-guide", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, loadAdPricingGuide: async () => guideStub };
});

type Res = { data: unknown; error: unknown };
let profilesRes: Res;
let storesRes: Res;
let cashRes: Res;
function makeSb() {
  return {
    from(table: string) {
      const res = table === "profiles" ? profilesRes : table === "stores" ? storesRes : cashRes;
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => res,
      };
      return chain;
    },
  };
}
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => makeSb() }));

import { GET } from "@/app/api/ads/pricing-guide/route";
import { formatAdGuidePhpMinor } from "@/components/ads/AdPricingGuideTable";
import { AD_PRICING_INQUIRY_ADS } from "@/lib/ads/ad-pricing-guide";

beforeEach(() => {
  vi.clearAllMocks();
  profilesRes = { data: { points: 12300 }, error: null };
  storesRes = { data: { id: "store-1" }, error: null };
  cashRes = { data: { balance_minor: 125000 }, error: null };
});

describe("G-3 ₱ 표기", () => {
  it("센타보가 0 이면 정수(₱350), 아니면 소수 2자리", () => {
    expect(formatAdGuidePhpMinor(35000)).toBe("₱350");
    expect(formatAdGuidePhpMinor(110000)).toBe("₱1,100");
    expect(formatAdGuidePhpMinor(12050)).toBe("₱120.50");
  });
});

describe("G-4 팝업·당김 광고 = 금액 문의 줄", () => {
  it("앱 시작 팝업·당김 광고 2줄 (금액 없음)", () => {
    expect(AD_PRICING_INQUIRY_ADS.map((a) => a.id)).toEqual(["app_popup", "pull_down"]);
  });
});

describe("G-6 내 보유액 (GET /api/ads/pricing-guide)", () => {
  it("로그인 회원: 내 포인트 + 승인된 내 매장 비즈 캐시", async () => {
    getRouteUserId.mockResolvedValue("user-1");
    const j = await (await GET()).json();
    expect(j.ok).toBe(true);
    expect(j.guide.storeHomeFeedOff).toBe(true);
    expect(j.mine).toEqual({ points: 12300, store: { storeId: "store-1", businessCashMinor: 125000 } });
  });

  it("비로그인: mine = null (금액 표는 그대로)", async () => {
    getRouteUserId.mockResolvedValue(null);
    const j = await (await GET()).json();
    expect(j.ok).toBe(true);
    expect(j.mine).toBeNull();
  });

  it("잔액 조회 실패는 0 이 아니라 null(「확인 못 함」) · 매장 없으면 store null", async () => {
    getRouteUserId.mockResolvedValue("user-1");
    profilesRes = { data: null, error: { message: "boom" } };
    storesRes = { data: null, error: null };
    const j = await (await GET()).json();
    expect(j.mine).toEqual({ points: null, store: null });
  });
});
