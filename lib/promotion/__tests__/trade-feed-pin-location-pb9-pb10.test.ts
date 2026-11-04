/**
 * 광고 ② PB-9 · PB-10 (2026-11-04) — 거래 카테고리 첫 화면(`/api/trade/feed`)·서버 시드가
 * 목록 API(`home-posts`)와 같은 동네/지역(lguCityId) 끼우기 조건을 쓴다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  project: vi.fn(),
  hood: vi.fn(),
  buildLoc: vi.fn(),
  resolveOpen: vi.fn(),
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
vi.mock("@/lib/trade/marketplace/list-contract/load-viewer-list-hood.server", () => ({
  loadViewerListHood: (...a: unknown[]) => h.hood(...a),
}));
vi.mock("@/lib/trade/marketplace/list-contract/trade-list-page.server", () => ({
  buildTradeListLocationParams: (...a: unknown[]) => h.buildLoc(...a),
}));

import { resolveTradeFeedOpenPayload } from "@/lib/posts/resolve-trade-feed-open-payload";

const clients = { readSb: {}, serviceSb: {}, favoritesSb: {} } as never;
const HOOD = { regionId: "ncr", cityId: "pasig-kapitolyo" };

beforeEach(() => {
  vi.clearAllMocks();
  h.fetchPage.mockResolvedValue({ posts: [{ id: "a" }], hasMore: false });
  h.project.mockImplementation(async (_sb: unknown, o: { posts: unknown[] }) => ({ posts: o.posts, promotedIdsOnPage: [] }));
  h.hood.mockResolvedValue(HOOD);
  h.buildLoc.mockImplementation((input: unknown) => ({ built: input }));
});

describe("PB-9 /api/trade/feed 끼우기 조건 = 목록 API 와 같은 동네 조건", () => {
  it("시 선택 + 거리 「전체」 + 로그인 → 회원 대표 주소 동네를 지역 구간 계산에 넣는다", async () => {
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "PH-PASIG", radiusKm: null }, "viewer-1");
    expect(h.hood).toHaveBeenCalledWith(expect.anything(), "viewer-1");
    expect(h.buildLoc).toHaveBeenCalledWith(
      expect.objectContaining({ lguCityId: "PH-PASIG", radiusKm: null, hood: HOOD, withDistance: false })
    );
    const pinFilter = (h.project.mock.calls[0]![1] as { pinFilter: { location: unknown } }).pinFilter;
    expect(pinFilter.location).toEqual({ built: expect.objectContaining({ hood: HOOD }) });
  });

  it("거리(반경)를 고르면 목록 API 처럼 동네 조건 없음", async () => {
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "PH-PASIG", radiusKm: 5 }, "viewer-1");
    expect(h.hood).not.toHaveBeenCalled();
    expect(h.buildLoc).toHaveBeenCalledWith(expect.objectContaining({ hood: null, radiusKm: 5 }));
  });

  it("지역 미지정이면 지역 조건 자체가 없다", async () => {
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest" }, "viewer-1");
    expect(h.hood).not.toHaveBeenCalled();
    expect(h.buildLoc).not.toHaveBeenCalled();
    expect((h.project.mock.calls[0]![1] as { pinFilter: { location: unknown } }).pinFilter.location).toBeNull();
  });

  it("비로그인이면 동네 없음(목록 API 와 같음)", async () => {
    h.hood.mockResolvedValue(null);
    await resolveTradeFeedOpenPayload(clients, ["c1"], { page: 1, sort: "latest", lguCityId: "PH-PASIG", radiusKm: null }, null);
    expect(h.buildLoc).toHaveBeenCalledWith(expect.objectContaining({ hood: null }));
  });
});
