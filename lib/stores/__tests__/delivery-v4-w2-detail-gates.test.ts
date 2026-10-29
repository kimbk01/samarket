/**
 * v4 W2 — API-14 비로그인 서버 게이트(상세 계열 = 로그인만, 업종 상단 배너 = 배달 열람 게이트),
 * API-09 delivery-serviceability 승인·노출 매장만·오류 원문 제거, API-10 고정 오류 코드,
 * PERF-11 리뷰 요약 DB 측 집계·slug 캐시.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

const h = vi.hoisted(() => ({
  viewer: null as string | null,
  storeRes: { ok: true, store: { id: "store-1", slug: "s", approval_status: "approved", is_visible: true } } as unknown,
  slugLookups: [] as string[],
  origin: null as Record<string, unknown> | null,
  bannerLoads: 0,
}));

let handler: (call: FakeCall) => FakeResult = () => ({ data: [], error: null });
let fake = createFakeStoreSupabase((c) => handler(c));

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => h.viewer }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/stores/get-approved-store-by-slug", () => ({
  STORE_SELECT_ID_SLUG_GATE: "id, slug, approval_status, is_visible",
  getApprovedStoreBySlug: async (_sb: unknown, slug: string, cols: string) => {
    h.slugLookups.push(`${slug}|${cols}`);
    return h.storeRes;
  },
}));
vi.mock("@/lib/stores/buyer-public-label", () => ({
  BUYER_PUBLIC_LABEL_FALLBACK: "구매자",
  mapBuyerUserIdsToPublicLabels: async () => ({}),
}));
vi.mock("@/lib/addresses/user-address-service", () => ({ getUserAddressDefaults: async () => ({ master: null }) }));
vi.mock("@/lib/delivery/load-delivery-serviceability-runtime", async (orig) => ({
  ...(await orig<typeof import("@/lib/delivery/load-delivery-serviceability-runtime")>()),
  loadDeliveryServiceabilityRuntimeContext: async () => ({
    policy: { enabled: false, source: "straight", defaultMaxKm: 10, overDistanceBehavior: "exclude" },
    overrides: { stores: {} },
  }),
}));
vi.mock("@/lib/stores/store-list-delivery-origin", () => ({
  resolveStoreListDeliveryOrigin: async () => h.origin,
}));
vi.mock("@/lib/stores/product/stores-browse-scope-policy-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/product/stores-browse-scope-policy-db")>()),
  listBrowseScopePolicyRows: async () => [],
}));
vi.mock("@/lib/stores/load-delivery-ad-physical-banners", () => ({
  loadVisiblePhysicalBannerSlides: async () => {
    h.bannerLoads += 1;
    return [];
  },
}));

import { GET as getBanners } from "@/app/api/stores/[slug]/banners/route";
import { GET as getNotices } from "@/app/api/stores/[slug]/notices/route";
import { GET as getReviews } from "@/app/api/stores/[slug]/reviews/route";
import { GET as getReviewsSummary } from "@/app/api/stores/[slug]/reviews-summary/route";
import { GET as getServiceability } from "@/app/api/stores/[slug]/delivery-serviceability/route";
import { GET as getBrowseTopBanners } from "@/app/api/stores/browse-top-banners/route";
import { STORE_PUBLIC_API_ERROR_CODES } from "@/lib/stores/store-public-api-error-codes";
import { summarizeReviewRatingCounts } from "@/lib/stores/store-review-rating-summary";

const STORE_ROW = { id: "store-1", slug: "s", lat: 14.6, lng: 121, approval_status: "approved", is_visible: true };
const ctx = { params: Promise.resolve({ slug: "s" }) };
const req = () => new Request("https://x.test/api/stores/s/x");
const nextReq = (url: string) =>
  Object.assign(new Request(url), { nextUrl: new URL(url) }) as unknown as import("next/server").NextRequest;

beforeEach(() => {
  h.viewer = null;
  h.storeRes = { ok: true, store: { id: "store-1", slug: "s", lat: 14.6, lng: 121, approval_status: "approved", is_visible: true } };
  h.slugLookups.length = 0;
  h.bannerLoads = 0;
  handler = (c) =>
    c.table === "stores" && c.single ? { data: { ...STORE_ROW }, error: null } : { data: [], error: null };
  fake = createFakeStoreSupabase((c) => handler(c));
});

describe("v4 API-14 — 상세 계열 비로그인 게이트 (로그인만)", () => {
  const routes = [
    ["banners", getBanners, "banners"],
    ["notices", getNotices, "notices"],
    ["reviews", getReviews, "reviews"],
    ["reviews-summary", getReviewsSummary, "recent"],
    ["delivery-serviceability", getServiceability, null],
  ] as const;

  for (const [name, GET, emptyKey] of routes) {
    it(`${name}: 비로그인 → 401 login_required, 본문 없음, 리뷰·공지 테이블 미조회`, async () => {
      const res = await GET(req(), ctx);
      expect(res.status).toBe(401);
      const j = await res.json();
      expect(j.error).toBe("login_required");
      expect(j.meta?.viewer_gate).toBe("login_required");
      if (emptyKey) expect(j[emptyKey]).toEqual([]);
      expect(fake.calls.filter((c) => c.table !== "stores")).toHaveLength(0);
      expect(j).not.toHaveProperty("storeId");
    });
    it(`${name}: 로그인 사용자(사장님·관리자 미리보기 포함)는 통과`, async () => {
      h.viewer = "user-1";
      const res = await GET(req(), ctx);
      expect(res.status).toBe(200);
    });
  }
});

describe("v4 API-09 — delivery-serviceability 승인·노출 매장만, 오류 원문 없음", () => {
  it("숨김·미승인 매장은 404 (id·좌표 미반환), 매 요청 최신 행으로 판정 (slug 메모리 캐시 미사용)", async () => {
    h.viewer = "user-1";
    for (const row of [{ ...STORE_ROW, is_visible: false }, { ...STORE_ROW, approval_status: "pending" }]) {
      handler = (c) => (c.table === "stores" ? { data: row, error: null } : { data: [], error: null });
      const res = await getServiceability(req(), ctx);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, error: "not_found" });
    }
    expect(h.slugLookups).toHaveLength(0);
    const ok = await (await (handler = (c) => (c.table === "stores" ? { data: STORE_ROW, error: null } : { data: [], error: null }), getServiceability(req(), ctx))).json();
    expect(ok.storeId).toBe("store-1");
  });
  it("DB 오류 → 500 고정 코드 (원문 미노출)", async () => {
    h.viewer = "user-1";
    handler = () => ({ data: null, error: { message: "relation secret_table does not exist" } });
    const res = await getServiceability(req(), ctx);
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toBe(STORE_PUBLIC_API_ERROR_CODES.deliveryServiceability);
    expect(JSON.stringify(j)).not.toContain("secret_table");
  });
});

describe("v4 API-10 — 고객 매장 API 500 고정 오류 코드", () => {
  it("banners·notices·reviews DB 오류 원문을 응답에 싣지 않는다", async () => {
    h.viewer = "user-1";
    handler = (c) => (c.table === "stores" ? { data: STORE_ROW, error: null } : { data: null, error: { message: "boom: column x" } });
    const b = await getBanners(req(), ctx);
    expect(b.status).toBe(500);
    expect((await b.json()).error).toBe(STORE_PUBLIC_API_ERROR_CODES.banners);
    const n = await getNotices(req(), ctx);
    expect(n.status).toBe(500);
    expect((await n.json()).error).toBe(STORE_PUBLIC_API_ERROR_CODES.notices);
    const r = await getReviews(req(), ctx);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe(STORE_PUBLIC_API_ERROR_CODES.reviews);
  });
  it("reviews-summary 매장 조회 DB 오류 → 고정 코드", async () => {
    h.viewer = "user-1";
    h.storeRes = { ok: false, reason: "db_error", message: "internal detail" };
    const res = await getReviewsSummary(req(), ctx);
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toBe(STORE_PUBLIC_API_ERROR_CODES.reviewsSummary);
    expect(JSON.stringify(j)).not.toContain("internal detail");
  });
});

describe("v4 PERF-11 — 리뷰 요약 DB 측 집계 · 리뷰 목록 slug 캐시", () => {
  it("별점 1~5 COUNT(head) 5건 + 최근 3건을 한 번에 조회하고 전체 행을 읽지 않는다", async () => {
    h.viewer = "user-1";
    const counts: Record<number, number> = { 1: 1, 2: 0, 3: 2, 4: 3, 5: 4 };
    handler = (c) => {
      if (c.table !== "store_reviews") return { data: [], error: null };
      const rating = c.filters.find(([m, col]) => m === "eq" && col === "rating")?.[2] as number | undefined;
      if (rating != null) return { data: null, error: null, count: counts[rating] } as FakeResult;
      return { data: [{ id: "r1", rating: 5, content: "good", created_at: "2026-10-01", buyer_user_id: null }], error: null };
    };
    const res = await getReviewsSummary(req(), ctx);
    const j = await res.json();
    expect(j.count).toBe(10);
    expect(j.distribution).toEqual({ 1: 1, 2: 0, 3: 2, 4: 3, 5: 4 });
    expect(j.avg_rating).toBe(3.9);
    expect(j.recent).toHaveLength(1);
    const reviewCalls = fake.calls.filter((c) => c.table === "store_reviews");
    expect(reviewCalls).toHaveLength(6);
    expect(reviewCalls.filter((c) => c.select === "id")).toHaveLength(5);
    expect(reviewCalls.some((c) => c.select === "rating")).toBe(false);
  });
  it("summarizeReviewRatingCounts — 기존 JS 집계와 같은 산식", () => {
    expect(summarizeReviewRatingCounts([0, 0, 0, 0, 0])).toEqual({
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      totalCount: 0,
      avgRating: null,
    });
    expect(summarizeReviewRatingCounts([0, 0, 1, 0, 2]).avgRating).toBe(4.3);
  });
  it("리뷰 목록은 stores 직접 조회 대신 승인 매장 slug 캐시(getApprovedStoreBySlug)", async () => {
    h.viewer = "user-1";
    await getReviews(req(), ctx);
    expect(h.slugLookups).toHaveLength(1);
    expect(fake.calls.filter((c) => c.table === "stores")).toHaveLength(0);
  });
});

describe("v4 API-14 — 업종 상단 배너 = 배달 열람 게이트", () => {
  const url = "https://x.test/api/stores/browse-top-banners?primary=restaurant";
  it("비로그인·주소 없음 → 빈 배너 + meta.viewer_gate, 배너 로더 미호출", async () => {
    h.origin = { source: "none", userId: null, lat: null, lng: null, canonicalLguId: null };
    const a = await (await getBrowseTopBanners(nextReq(url))).json();
    expect(a).toMatchObject({ ok: true, banners: [], physicalEnabled: false, meta: { viewer_gate: "login_required" } });
    h.origin = { source: "none", userId: "u-1", lat: null, lng: null, canonicalLguId: null };
    const b = await (await getBrowseTopBanners(nextReq(url))).json();
    expect(b.meta.viewer_gate).toBe("address_required");
    expect(h.bannerLoads).toBe(0);
  });
});
