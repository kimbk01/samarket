import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlatformPopupResolveDeduped,
  normalizePlatformPopupExcludeIds,
  platformPopupResolveFlightKey,
} from "@/lib/platform-popup/fetch-platform-popup-resolve-client";

/** 재감사 E-7 — 닫은 캠페인이 1위로 남아 다른 팝업까지 막던 문제: 서버가 빼고 다음 순위를 고른다 */
describe("popup resolve excludes session-blocked campaigns", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends exclude ids (sorted, deduped) and keys the flight by them", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, winner: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPlatformPopupResolveDeduped({
      pathname: "/market",
      sessionKey: "s-e7",
      deviceKey: "d-e7",
      generation: "1",
      excludeCampaignIds: ["b", "a", "b"],
    });
    const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(new URL(url, "https://x.test").searchParams.get("exclude")).toBe("a,b");
    expect(normalizePlatformPopupExcludeIds(["b", "a", "b"])).toEqual(["a", "b"]);
    expect(
      platformPopupResolveFlightKey({ pathname: "/market", sessionKey: "s", deviceKey: "d", excludeCampaignIds: ["a"] })
    ).not.toBe(platformPopupResolveFlightKey({ pathname: "/market", sessionKey: "s", deviceKey: "d" }));
  });

  it("resolve route drops excluded candidates before choosing the winner; host passes the session list", () => {
    const route = readFileSync(join(process.cwd(), "app/api/platform-popup/resolve/route.ts"), "utf8");
    expect(route).toContain('url.searchParams.get("exclude")');
    expect(route).toMatch(/loadedCandidates\.filter\(\(c\) => !exclude\.has\(c\.id\)\)/);
    expect(route.indexOf("loadedCandidates.filter")).toBeLessThan(route.indexOf("resolvePopupAd({"));
    const host = readFileSync(join(process.cwd(), "components/platform-popup/GlobalPopupHost.tsx"), "utf8");
    expect(host).toContain("excludeCampaignIds: listPlatformPopupSessionBlockedCampaigns()");
    // CTA 이동 실패 시 잠금 해제
    expect(host).toContain("if (!opened) ctaHandledExposureRef.current = null;");
  });
});
