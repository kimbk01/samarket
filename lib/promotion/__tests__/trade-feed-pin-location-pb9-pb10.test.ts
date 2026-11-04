/**
 * Owner 2026-11-05 「광고 지역 제한 전면 해제」 — 거래 카테고리 첫 화면(`/api/trade/feed`)의 상위노출 끼우기 조건에
 * 보는 회원의 지역·동네·거리를 넣지 않는다(예전 PB-9 동네 조건 폐지). 일반 목록 조회에는 지역 값을 그대로 넘긴다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  project: vi.fn(),
}));

vi.mock("@/lib/posts/fetch-trade-feed-page", () => ({
  fetchTradeFeedPage: (...a: unknown[]) => h.fetchPage(...a),
  TradeFeedQueryError: class extends Error {},
}));
vi.mock("@/lib/posts/trade-feed-favorites-server-cache", () => ({ getTradeFeedFavoriteMapCached: async () => ({}) }));
vi.mock("@/lib/posts/enrich-posts-author-nicknames", () => ({ enrichPostsAuthorNicknamesFromProfiles: async () => {} }));
vi.mock("@/lib/promotion/feed-promotion-projection", () => ({
  applyTradeHomePromotionProjection: (...a: unknown[]) => h.project(...a),
  tradePromotionPageIndexFromRequestPage: (p: number) => p - 1,
}));

import { resolveTradeFeedOpenPayload } from "@/lib/posts/resolve-trade-feed-open-payload";

const clients = { readSb: {}, serviceSb: {}, favoritesSb: {} } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.fetchPage.mockResolvedValue({ posts: [{ id: "a" }], hasMore: false });
  h.project.mockImplementation(async (_sb: unknown, o: { posts: unknown[] }) => ({ posts: o.posts, promotedIdsOnPage: [] }));
});

const pinFilterOf = (call: number) =>
  (h.project.mock.calls[call]![1] as { pinFilter: Record<string, unknown> }).pinFilter;

describe("/api/trade/feed 끼우기 조건 — 지역 무관 (Owner 2026-11-05)", () => {
  it("시·거리·로그인 여부가 달라도 끼우기 조건이 같다 · 지역 값이 없다", async () => {
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "1381200000", radiusKm: null }, "viewer-pasig");
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "1380600000", radiusKm: 5 }, "viewer-manila");
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "1381300000" }, null);
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest" }, "viewer-x");
    const filters = [0, 1, 2, 3].map(pinFilterOf);
    for (const f of filters) {
      expect(f).not.toHaveProperty("location");
      expect(f).toEqual(filters[0]);
    }
  });

  it("일반 목록 조회에는 지역 값을 그대로 넘긴다(일반 글 지역 기능 유지)", async () => {
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "1380600000", radiusKm: 5 }, "v");
    expect(h.fetchPage.mock.calls[0]![2]).toMatchObject({ lguCityId: "1380600000", radiusKm: 5 });
  });
});
