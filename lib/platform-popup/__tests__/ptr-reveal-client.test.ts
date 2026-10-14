import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPtrRevealAdsForTests,
  __setPtrRevealAdForTests,
  finishPtrRevealExposure,
  readPtrRevealAd,
  type PtrRevealAd,
} from "@/lib/platform-popup/ptr-reveal-client";

function ad(campaignId: string, frequencyMode: PtrRevealAd["frequencyMode"]): PtrRevealAd {
  const band = { creativeId: `cr-${campaignId}`, imageUrl: "https://cdn.example/a.webp", altText: "a" };
  return {
    campaignId, surface: "TRADE", href: "/market", ctaLabel: null, title: null, frequencyMode,
    suppressionDurationSeconds: null, timezone: "Asia/Manila", bands: { default: band, tablet: null, logo: null },
  };
}

describe("ptr-reveal client — frequency handling", () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  beforeEach(() => {
    __resetPtrRevealAdsForTests();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { sessionStorage: { getItem: () => "s1", setItem: () => {} }, localStorage: { getItem: () => "d1", setItem: () => {} } });
    fetchMock.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("close_only: no DB suppression row; held on the same surface, released after moving to another surface", () => {
    __setPtrRevealAdForTests("TRADE", ad("c1", "close_only"));
    expect(readPtrRevealAd("/market")?.campaignId).toBe("c1");
    finishPtrRevealExposure("/market", ad("c1", "close_only"));
    expect(fetchMock).not.toHaveBeenCalled();
    // 재조회로 같은 캠페인이 와도 같은 표면에서는 보류
    __setPtrRevealAdForTests("TRADE", ad("c1", "close_only"));
    expect(readPtrRevealAd("/market")).toBeNull();
    // 다른 캠페인은 보류 대상 아님
    __setPtrRevealAdForTests("TRADE", ad("c2", "close_only"));
    expect(readPtrRevealAd("/market")?.campaignId).toBe("c2");
    // 다른 표면 방문 후 복귀 → 해제
    __setPtrRevealAdForTests("TRADE", ad("c1", "close_only"));
    readPtrRevealAd("/philife");
    expect(readPtrRevealAd("/market")?.campaignId).toBe("c1");
  });

  it("once_per_session: writes SESSION suppression via /api/platform-popup/suppress (separate from impression)", () => {
    __setPtrRevealAdForTests("TRADE", ad("c3", "once_per_session"));
    finishPtrRevealExposure("/market", ad("c3", "once_per_session"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/api/platform-popup/suppress");
    expect(JSON.parse(String(call[1].body))).toMatchObject({ campaignId: "c3", mode: "SESSION" });
    expect(readPtrRevealAd("/market")).toBeNull(); // 캐시 비움 → 재조회 대상
  });

  it("messenger path never yields an ad", () => {
    __setPtrRevealAdForTests("TRADE", ad("c1", "close_only"));
    expect(readPtrRevealAd("/community-messenger")).toBeNull();
  });
});
