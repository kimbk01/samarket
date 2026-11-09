/** @vitest-environment jsdom */
/**
 * GROUP 2-B (Owner 승인 2026-11-10) — 「판매」 허브 개요 숫자 첫 그림 계약.
 * 스냅샷 있으면 그 값, 없으면 loading(스켈레톤), 실패만 null(「—」), 0 으로 채우지 않음.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const salesMock = vi.fn();
vi.mock("@/lib/mypage/trade-history-client", () => ({
  fetchTradeHistorySalesBySession: () => salesMock(),
}));
vi.mock("@/lib/mypage/seller-listings-with-trades", () => ({
  countActiveListingProducts: (posts: unknown[]) => posts.length,
  countOpenSellerChatRows: (rows: unknown[]) => rows.length,
}));

import {
  __resetSellHubOverviewForTests,
  getSellHubOverviewState,
  loadSellHubOverview,
  seedSellHubOverview,
} from "@/lib/trade/sell-hub-overview-client";

const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

function mockFetch(opts: { perfOk?: boolean; postsOk?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("trade-performance"))
        return opts.perfOk === false
          ? json({ ok: false }, false)
          : json({ ok: true, views: 5, favorites: 2, reports: 0 });
      if (url.includes("/api/my/posts"))
        return opts.postsOk === false ? json({}, false) : json({ posts: [{}, {}, {}] });
      return json({});
    })
  );
}

beforeEach(() => {
  __resetSellHubOverviewForTests();
  sessionStorage.clear();
  salesMock.mockReset();
  salesMock.mockResolvedValue([{}]);
});
afterEach(() => vi.unstubAllGlobals());

describe("판매 허브 개요 첫 그림", () => {
  it("스냅샷이 없으면 loading — 값 null(0 아님)", () => {
    const s = seedSellHubOverview("u1");
    expect(s).toEqual({ viewerId: "u1", values: null, loading: true });
  });

  it("조회 성공 → 값 채움 + 스냅샷 저장, 다음 시드는 스냅샷으로 바로 값", async () => {
    mockFetch();
    await loadSellHubOverview("u1");
    expect(getSellHubOverviewState()?.values).toEqual({
      activeListingCount: 3,
      openChatCount: 1,
      performance: { views: 5, favorites: 2, reports: 0 },
    });
    __resetSellHubOverviewForTests();
    const seeded = seedSellHubOverview("u1");
    expect(seeded?.loading).toBe(false);
    expect(seeded?.values?.activeListingCount).toBe(3);
  });

  it("다른 계정 스냅샷은 읽지 않는다", async () => {
    mockFetch();
    await loadSellHubOverview("u1");
    __resetSellHubOverviewForTests();
    expect(seedSellHubOverview("u2")).toEqual({ viewerId: "u2", values: null, loading: true });
  });

  it("실패한 칸만 null(「—」), 0 으로 채우지 않음", async () => {
    mockFetch({ perfOk: false, postsOk: false });
    salesMock.mockRejectedValue(new Error("x"));
    await loadSellHubOverview("u1");
    const s = getSellHubOverviewState();
    expect(s?.loading).toBe(false);
    expect(s?.values).toEqual({ activeListingCount: null, openChatCount: null, performance: null });
  });

  it("재조회 실패 시 직전 값 유지", async () => {
    mockFetch();
    await loadSellHubOverview("u1");
    mockFetch({ perfOk: false, postsOk: false });
    salesMock.mockRejectedValue(new Error("x"));
    await loadSellHubOverview("u1");
    expect(getSellHubOverviewState()?.values?.activeListingCount).toBe(3);
    expect(getSellHubOverviewState()?.values?.performance?.views).toBe(5);
  });
});

describe("판매 허브 화면 배선(소스 계약)", () => {
  it("로그인 사용자 없을 때 0 으로 정하던 코드가 없고, 「—」는 값 null 일 때만", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/trade/MarketplaceSellHubPage.tsx", "utf8");
    expect(src).not.toContain("setActiveListingCount(0)");
    expect(src).toContain("seedSellHubOverview(viewerId)");
    expect(src).toContain('data-sell-hub-value-loading="1"');
  });
});
