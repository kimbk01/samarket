import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 광고 최종 점검 P2 (팝업·PTR) — docs/audit/ads-final-double-check-2026-11-03.md §2-2
 *  1) 새로고침하면 × 로 닫은 기록이 지워진다
 *  2) CAMPAIGN 숨김에 campaignRevision 이 없어 소재를 바꿔도 계속 숨겨진다
 *  3) 1위 결과가 무효면 다음 순위로 넘어가지 않는다 (팝업 resolve)
 *  4) PTR 도 E-7 과 같다 — 보류된 1위 때문에 다른 띠가 나오지 않는다
 */

const loadCandidatesMock = vi.fn();

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({}),
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => null,
}));
vi.mock("@/lib/platform-popup/load-popup-candidates", () => ({
  loadPlatformPopupCandidates: (...args: unknown[]) => loadCandidatesMock(...args),
}));
vi.mock("@/lib/platform-promotion-lifecycle/load-content-visits", () => ({
  loadSessionCoordinatedEventIds: async () => new Set<string>(),
}));

import type { NextRequest } from "next/server";
import { GET as resolveGET } from "@/app/api/platform-popup/resolve/route";
import { GET as ptrGET } from "@/app/api/platform-popup/ptr-reveal/route";
import {
  addPlatformPopupSessionBlockedCampaign,
  decidePlatformPopupIdentity,
  isPlatformPopupSessionBlockedCampaign,
} from "@/lib/platform-popup/popup-app-session";
import {
  __resetPtrRevealAdsForTests,
  __setPtrRevealAdForTests,
  ensurePtrRevealAd,
  finishPtrRevealExposure,
  listPtrRevealHeldCampaignIds,
  type PtrRevealAd,
} from "@/lib/platform-popup/ptr-reveal-client";
import { resolveFirstPresentablePopupCandidate } from "@/lib/platform-popup/resolve-first-presentable";
import {
  selectPlatformPopupEligibleWinner,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";

const readRepo = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function popup(id: string, over: Partial<PlatformPopupCandidate> = {}): PlatformPopupCandidate {
  return {
    id,
    status: "active",
    approvalStatus: "approved",
    priority: 1,
    surfaces: ["GLOBAL"],
    presentationType: "center_modal",
    creative: {
      id: `cr-${id}`,
      status: "ready",
      aspectW: 36,
      aspectH: 25,
      creativeMode: "card",
      assetUrl: `https://cdn.example/${id}.webp`,
    },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ...over,
  };
}

function ptr(id: string, over: Partial<PlatformPopupCandidate> = {}): PlatformPopupCandidate {
  const band = { id: `band-${id}`, assetUrl: `https://cdn.example/${id}.webp`, assetPath: null, altText: null, aspectW: 4, aspectH: 1 };
  return popup(id, {
    presentationType: "ptr_reveal",
    creative: { id: band.id, status: "ready", aspectW: 4, aspectH: 1, creativeMode: "ptr_band", assetUrl: band.assetUrl },
    ptrBands: { default: band },
    ...over,
  });
}

const req = (path: string) => ({ url: `https://dibay.test${path}` }) as unknown as NextRequest;

describe("P2-1 새로고침 후 × 닫기 기록 유지 (계정 판정)", () => {
  it("로그인 확인 중(checking)은 판정하지 않고, 확인 후 첫 값은 기준일 뿐 변경이 아니다", () => {
    // 새로고침 직후: checking → member 로 확정
    const a = decidePlatformPopupIdentity({ previous: null, authReady: false, userId: null, deviceKey: "d1" });
    expect(a).toEqual({ identity: null, changed: false });
    const b = decidePlatformPopupIdentity({ previous: a.identity, authReady: true, userId: "u1", deviceKey: "d1" });
    expect(b).toEqual({ identity: "u1", changed: false });
    // 회원 → 재확인 중(checking) → 같은 회원: 변경 아님
    const c = decidePlatformPopupIdentity({ previous: "u1", authReady: false, userId: null, deviceKey: "d1" });
    expect(c).toEqual({ identity: "u1", changed: false });
  });

  it("실제 계정 변경(로그아웃·다른 계정)은 여전히 변경으로 본다", () => {
    expect(decidePlatformPopupIdentity({ previous: "u1", authReady: true, userId: null, deviceKey: "d1" })).toEqual({
      identity: "anon:d1",
      changed: true,
    });
    expect(decidePlatformPopupIdentity({ previous: "u1", authReady: true, userId: "u2", deviceKey: "d1" }).changed).toBe(true);
  });

  it("닫은 기록은 sessionStorage 에 있어 같은 앱 실행의 새로고침(모듈 재적재)에도 남는다", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    try {
      addPlatformPopupSessionBlockedCampaign("closed-1");
      vi.resetModules();
      const fresh = await import("@/lib/platform-popup/popup-app-session");
      expect(fresh.isPlatformPopupSessionBlockedCampaign("closed-1")).toBe(true);
      expect(isPlatformPopupSessionBlockedCampaign("closed-1")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("호스트는 계정 판정 함수만 쓰고, 변경일 때만 닫은 기록을 지운다", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    const effect = host.slice(host.indexOf("// Auth identity isolation"), host.indexOf("}, [authReady, userId, deviceKey]);"));
    expect(effect).toContain("decidePlatformPopupIdentity({");
    expect(effect).toMatch(/if \(decision\.changed\) \{[\s\S]*clearPlatformPopupSessionBlockedCampaigns\(\);/);
  });
});

describe("P2-2 CAMPAIGN 숨김 revision = 소재 id", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const campaignRow = { mode: "CAMPAIGN" as const, sessionKey: null, suppressUntil: null, timezone: null, createdAt: now.toISOString() };

  it("같은 소재로 숨겼으면 계속 숨김, 소재가 바뀌면 다시 노출", () => {
    const same = popup("c1", { campaignRevision: "cr-old", suppressions: [{ ...campaignRow, campaignRevision: "cr-old" }] });
    expect(selectPlatformPopupEligibleWinner({ pathname: "/market", now, candidates: [same] }, "interruptive").winner).toBeNull();
    const changed = popup("c1", { campaignRevision: "cr-new", suppressions: [{ ...campaignRow, campaignRevision: "cr-old" }] });
    expect(selectPlatformPopupEligibleWinner({ pathname: "/market", now, candidates: [changed] }, "interruptive").winner?.id).toBe("c1");
  });

  it("서버 후보 revision = 소재 기준값 + 목적지 해시(D-2), 팝업·PTR 은 CAMPAIGN 숨김에 그 판을 보낸다", () => {
    // Owner 결정 2 (2026-11-04): 팝업 = 소재 id · PTR = 띠 3종 소재 id (ptrRevealCampaignRevision) · D-2: + CTA 목적지 해시
    expect(readRepo("lib/platform-popup/load-popup-candidates.ts")).toContain(
      "isPtr ? ptrRevealCampaignRevision(ptrBandsByCampaign.get(c.id)) ?? cr?.id ?? null : cr?.id ?? null,"
    );
    expect(readRepo("lib/platform-popup/load-popup-candidates.ts")).toContain("withPlatformPopupDestinationRevision(");
    expect(readRepo("components/platform-popup/GlobalPopupHost.tsx")).toContain(
      'campaignRevision: mode === "CAMPAIGN" ? winner.revision ?? creativeId : undefined,'
    );
  });

  it("PTR 한 번만(once_campaign) 숨김 기록에 휴대폰 띠 소재 id 를 싣는다", () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { sessionStorage: { getItem: () => "s1", setItem: () => {} }, localStorage: { getItem: () => "d1", setItem: () => {} } });
    try {
      __resetPtrRevealAdsForTests();
      const ad = ptrAd("p9", "once_campaign");
      finishPtrRevealExposure("/market", ad);
      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(String(call[1].body))).toMatchObject({ campaignId: "p9", mode: "CAMPAIGN", campaignRevision: "band-p9" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("P2-3 팝업 resolve — 1위가 무효면 다음 순위", () => {
  beforeEach(() => loadCandidatesMock.mockReset());

  it("공통 루프: 무효 1위를 빼고 다음 후보를 고른다 · 전부 무효면 마지막 이유 · 오류는 그대로", async () => {
    const cands = [popup("a"), popup("b")];
    const order = (rem: readonly PlatformPopupCandidate[]) =>
      rem.length ? ({ kind: "winner", campaignId: rem[0]!.id, winner: rem[0]!.id } as const) : ({ kind: "none", reason: "no_eligible_campaign" } as const);
    const ok = await resolveFirstPresentablePopupCandidate({
      candidates: cands,
      select: order,
      present: async (id) => (id === "a" ? { ok: false, reason: "presentation_invalid" } : { ok: true, value: id }),
    });
    expect(ok).toMatchObject({ kind: "presented", value: "b", skippedCampaignIds: ["a"] });
    const none = await resolveFirstPresentablePopupCandidate({
      candidates: cands,
      select: order,
      present: async () => ({ ok: false, reason: "benefit_content_required" }),
    });
    expect(none).toEqual({ kind: "none", reason: "benefit_content_required", skippedCampaignIds: ["a", "b"] });
    const err = await resolveFirstPresentablePopupCandidate({
      candidates: cands,
      select: () => ({ kind: "error", error: "boom" }),
      present: async () => ({ ok: true, value: 1 }),
    });
    expect(err).toEqual({ kind: "error", error: "boom" });
  });

  it("route: 우선순위 1위의 소재 주소가 없으면(presentation_invalid) 2위 팝업을 돌려준다", async () => {
    loadCandidatesMock.mockResolvedValue([
      popup("top", { priority: 9, creative: { id: "cr-top", status: "ready", aspectW: 36, aspectH: 25, creativeMode: "card" } }),
      popup("second", { priority: 1 }),
    ]);
    const json = await (await resolveGET(req("/api/platform-popup/resolve?pathname=/market&sessionKey=s&deviceKey=d"))).json();
    expect(json.winner?.campaignId).toBe("second");
    expect(json.impression).toBe(false);
  });

  it("route: 후보가 전부 무효면 이전과 같은 이유로 winner=null", async () => {
    loadCandidatesMock.mockResolvedValue([
      popup("top", { creative: { id: "cr-top", status: "ready", aspectW: 36, aspectH: 25, creativeMode: "card" } }),
    ]);
    const json = await (await resolveGET(req("/api/platform-popup/resolve?pathname=/market"))).json();
    expect(json).toMatchObject({ ok: true, winner: null, reason: "presentation_invalid" });
  });
});

function ptrAd(campaignId: string, frequencyMode: PtrRevealAd["frequencyMode"]): PtrRevealAd {
  const band = { creativeId: `band-${campaignId}`, imageUrl: "https://cdn.example/a.webp", altText: "a" };
  return {
    campaignId, surface: "TRADE", href: "/market", ctaLabel: null, title: null, frequencyMode,
    suppressionDurationSeconds: null, timezone: "Asia/Manila", bands: { default: band, tablet: null, logo: null },
  };
}

describe("P2-4 PTR — 보류된 1위는 서버가 빼고 다음 띠", () => {
  beforeEach(() => loadCandidatesMock.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("route: exclude 로 받은 보류 캠페인을 빼고 다음 순위 띠를 돌려준다", async () => {
    loadCandidatesMock.mockResolvedValue([ptr("held", { priority: 9 }), ptr("next", { priority: 1 })]);
    const first = await (await ptrGET(req("/api/platform-popup/ptr-reveal?pathname=/market"))).json();
    expect(first.ad?.campaignId).toBe("held");
    const json = await (await ptrGET(req("/api/platform-popup/ptr-reveal?pathname=/market&exclude=held"))).json();
    expect(json.ad?.campaignId).toBe("next");
  });

  it("route: 1위 휴대폰 띠가 무효면(ptr_band_missing) 다음 순위", async () => {
    loadCandidatesMock.mockResolvedValue([ptr("broken", { priority: 9, ptrBands: {} }), ptr("ok", { priority: 1 })]);
    const json = await (await ptrGET(req("/api/platform-popup/ptr-reveal?pathname=/market"))).json();
    expect(json.ad?.campaignId).toBe("ok");
  });

  it("client: 같은 화면 close_only 보류·숨김 기록 실패 캠페인을 다음 조회의 exclude 로 보낸다", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => "s1", setItem: () => {} },
      localStorage: { getItem: () => "d1", setItem: () => {} },
      requestIdleCallback: (cb: () => void) => {
        cb();
        return 1;
      },
    });
    __resetPtrRevealAdsForTests();
    // close_only 노출 종료 → 같은 화면에서 보류
    __setPtrRevealAdForTests("TRADE", ptrAd("c1", "close_only"));
    finishPtrRevealExposure("/market", ptrAd("c1", "close_only"));
    // 숨김 기록 실패(500) → 이 실행 동안 보류
    finishPtrRevealExposure("/market", ptrAd("c7", "once_per_day"));
    await new Promise((r) => setTimeout(r, 0));
    expect(listPtrRevealHeldCampaignIds("TRADE")).toEqual(["c1", "c7"]);

    fetchMock.mockClear();
    ensurePtrRevealAd("/market", "default");
    await new Promise((r) => setTimeout(r, 0));
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/api/platform-popup/ptr-reveal?");
    expect(new URL(url, "https://x.test").searchParams.get("exclude")).toBe("c1,c7");
  });
});
