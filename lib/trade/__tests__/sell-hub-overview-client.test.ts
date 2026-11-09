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
  countOpenSellerChatRows: (rows: unknown[]) => rows.length,
}));

import {
  SELL_HUB_OVERVIEW_SNAPSHOT_TTL_MS,
  __resetSellHubOverviewForTests,
  clearSellHubOverview,
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
        return opts.postsOk === false
          ? json({}, false)
          : json({
              posts: [
                { id: "p1", status: "active" },
                { id: "p2", status: "active" },
                { id: "p3", status: "active" },
                { id: "p4", status: "sold" },
              ],
            });
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
    expect(s).toEqual({ viewerId: "u1", values: null, fetchedAt: 0, loading: true });
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
    expect(seedSellHubOverview("u2")).toEqual({ viewerId: "u2", values: null, fetchedAt: 0, loading: true });
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

describe("재감사 보완 (2026-11-10)", () => {
  it("판매중 = /mypage/products 판매중 탭 규칙(판매완료 제외)", async () => {
    mockFetch();
    await loadSellHubOverview("u1");
    expect(getSellHubOverviewState()?.values?.activeListingCount).toBe(3);
  });

  it("메모리 값도 10분이 지나면 버린다", async () => {
    mockFetch();
    await loadSellHubOverview("u1");
    const at = getSellHubOverviewState()!.fetchedAt;
    sessionStorage.clear();
    const seeded = seedSellHubOverview("u1", at + SELL_HUB_OVERVIEW_SNAPSHOT_TTL_MS + 1);
    expect(seeded).toEqual({ viewerId: "u1", values: null, fetchedAt: 0, loading: true });
  });

  it("로그아웃·계정 전환 정리 = 메모리와 sessionStorage 전부(다른 계정 키 포함)", async () => {
    mockFetch();
    await loadSellHubOverview("u1");
    sessionStorage.setItem("dibay.sell-hub-overview.v1:u0", "{}");
    sessionStorage.setItem("other-key", "x");
    clearSellHubOverview();
    expect(getSellHubOverviewState()).toBeNull();
    expect(sessionStorage.getItem("dibay.sell-hub-overview.v1:u1")).toBeNull();
    expect(sessionStorage.getItem("dibay.sell-hub-overview.v1:u0")).toBeNull();
    expect(sessionStorage.getItem("other-key")).toBe("x");
  });

  it("빈 viewer 는 시드하지 않는다(비회원 화면은 컴포넌트가 빈 칸 처리)", () => {
    expect(seedSellHubOverview("")).toBeNull();
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
