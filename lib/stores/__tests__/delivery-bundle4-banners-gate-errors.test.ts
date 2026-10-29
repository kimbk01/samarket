/**
 * 묶음4 F-06 배너 single-flight·클라 캐시, R-1 서버 게이트, R-2 첫 페인트 게이트 예측, F-09 고정 오류 코드.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  origin: null as Record<string, unknown> | null,
  storeRes: null as unknown,
  bannerLoads: 0,
}));

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/store-list-delivery-origin", () => ({
  resolveStoreListDeliveryOrigin: async () => h.origin,
}));
vi.mock("@/lib/stores/load-store-banner-ad-campaigns", () => ({
  loadVisibleStoresHomeHeroBanners: async () => {
    h.bannerLoads += 1;
    return [{ id: "b1", imageUrl: "x", exposureToken: "t" }];
  },
}));
vi.mock("@/lib/stores/advertising/mark-sample-store-banner-slides", () => ({
  markSampleStoreBannerSlides: async (_sb: unknown, slides: unknown[]) => slides,
}));
vi.mock("@/lib/stores/composition/stores-composition-policy-db", () => ({
  loadResolvedCompositionPolicy: async () => ({ rows: [] }),
}));
vi.mock("@/lib/stores/load-delivery-ad-physical-banners", () => ({
  loadVisiblePhysicalBannerSlides: async () => {
    h.bannerLoads += 1;
    return [];
  },
}));
vi.mock("@/lib/stores/get-approved-store-by-slug", () => ({
  STORE_SELECT_LEGACY_DETAIL: "*",
  STORE_SELECT_SUMMARY: "*",
  getApprovedStoreBySlug: async () => h.storeRes,
  loadStoreCommerceMeta: async () => ({}),
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => null }));

import { GET as getHero } from "@/app/api/stores/home-hero-banners/route";
import { GET as getBeforeRest } from "@/app/api/stores/home-before-rest-banners/route";
import { GET as getStoreDetail } from "@/app/api/stores/[slug]/route";
import { fetchStoreSummaryPublicShared } from "@/lib/stores/fetch-store-summary-public";
import { resolveStoreDetailViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { predictDeliveryViewerGateFromClientState } from "@/lib/stores/delivery-viewer-gate-first-paint";
import {
  clearStoresHomeBannersClientCache,
  fetchStoresHomeBannersDeduped,
  peekStoresHomeBannersClientCache,
  prewarmStoresHomeBanners,
} from "@/lib/stores/stores-home-banners-client";

const nextReq = (url: string) =>
  Object.assign(new Request(url), { nextUrl: new URL(url) }) as unknown as import("next/server").NextRequest;

beforeEach(() => {
  h.bannerLoads = 0;
});

describe("F-06 홈 배너 클라 fetcher — single-flight·짧은 캐시·force", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    clearStoresHomeBannersClientCache();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, banners: [{ id: "b" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("동시 호출은 네트워크 1건으로 합친다", async () => {
    const [a, b] = await Promise.all([
      fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners"),
      fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("TTL 안 재마운트는 캐시로 즉시 (네트워크 없음), force 는 다시 조회 (refreshKey)", async () => {
    await fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners");
    expect(peekStoresHomeBannersClientCache("/api/stores/home-hero-banners")).not.toBeNull();
    await fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prewarm 은 히어로·before-rest 를 병렬로 시작하고, 이후 마운트는 같은 비행에 합류", async () => {
    prewarmStoresHomeBanners();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([
      "/api/stores/home-before-rest-banners",
      "/api/stores/home-hero-banners",
    ]);
    await fetchStoresHomeBannersDeduped("/api/stores/home-before-rest-banners");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("실패 응답은 캐시하지 않는다", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    await fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners");
    expect(peekStoresHomeBannersClientCache("/api/stores/home-hero-banners")).toBeNull();
  });

  it("배너 컴포넌트가 fetcher 를 쓰고 refreshKey 의존을 유지한다 (묶음 2 B-08)", () => {
    for (const f of ["StoresHomeHeroBanner.tsx", "StoresHomeBeforeRestBanner.tsx"]) {
      const src = readFileSync(join(process.cwd(), "components/stores/home/hub", f), "utf8");
      expect(src).toContain("fetchStoresHomeBannersDeduped(");
      expect(src).toContain("}, [refreshKey]);");
      expect(src).not.toMatch(/fetch\("\/api\/stores\/home-/);
    }
    const hub = readFileSync(join(process.cwd(), "components/stores/home/hub/StoresHomeHub.tsx"), "utf8");
    expect(hub).toContain("prewarmStoresHomeBanners();");
    expect(hub).toContain("prewarmStoresHomeBanners({ force: true });");
  });
});

describe("R-1 홈 배너 API 서버 게이트", () => {
  it("비로그인·주소 없는 회원 → 빈 배너 + meta.viewer_gate, 배너 로더 미호출", async () => {
    h.origin = { source: "none", userId: null };
    const guest = await (await getHero(nextReq("http://x/api/stores/home-hero-banners"))).json();
    expect(guest.banners).toEqual([]);
    expect(guest.meta.viewer_gate).toBe("login_required");
    h.origin = { source: "none", userId: "u1" };
    const noAddr = await (await getBeforeRest(nextReq("http://x/api/stores/home-before-rest-banners"))).json();
    expect(noAddr.banners).toEqual([]);
    expect(noAddr.meta.viewer_gate).toBe("address_required");
    expect(h.bannerLoads).toBe(0);
  });

  it("저장 주소 회원은 기존과 같이 배너를 받는다", async () => {
    h.origin = { source: "saved_address", userId: "u1" };
    const ok = await (await getHero(nextReq("http://x/api/stores/home-hero-banners"))).json();
    expect(ok.banners).toHaveLength(1);
    expect(h.bannerLoads).toBe(1);
  });

  it("매장 상세 게이트는 로그인 여부만 본다 (주소 없음 회원·사장님·관리자 통과)", () => {
    expect(resolveStoreDetailViewerGate(null)).toBe("login_required");
    expect(resolveStoreDetailViewerGate("  ")).toBe("login_required");
    expect(resolveStoreDetailViewerGate("u1")).toBe("ok");
  });
});

describe("R-2 첫 페인트 게이트 예측", () => {
  const snap = (master: unknown) => ({ ok: true, status: 200, defaults: { master }, neighborhoodFromLife: null });
  it("확인 중·스냅샷 없음은 예측하지 않는다", () => {
    expect(predictDeliveryViewerGateFromClientState({ membershipStatus: "checking", addressSnapshot: null })).toBeNull();
    expect(predictDeliveryViewerGateFromClientState({ membershipStatus: "member", addressSnapshot: null })).toBeNull();
  });
  it("비회원 → login_required", () => {
    expect(predictDeliveryViewerGateFromClientState({ membershipStatus: "guest", addressSnapshot: null })).toBe(
      "login_required"
    );
  });
  it("회원 + 대표 주소 없음/좌표 불가 → address_required, 배달 좌표 있음 → ok (서버 규칙과 동일)", () => {
    expect(
      predictDeliveryViewerGateFromClientState({ membershipStatus: "member", addressSnapshot: snap(null) })
    ).toBe("address_required");
    expect(
      predictDeliveryViewerGateFromClientState({
        membershipStatus: "member",
        addressSnapshot: snap({ id: "a1", fullAddress: "x", latitude: 0, longitude: 0 }),
      })
    ).toBe("address_required");
    expect(
      predictDeliveryViewerGateFromClientState({
        membershipStatus: "member",
        addressSnapshot: snap({ id: "a1", fullAddress: "x", latitude: 14.5, longitude: 121 }),
      })
    ).toBe("ok");
  });
  it("허브는 서버 meta.viewer_gate 를 우선하고 없을 때만 예측을 쓴다", () => {
    const hub = readFileSync(join(process.cwd(), "components/stores/home/hub/StoresHomeHub.tsx"), "utf8");
    expect(hub).toContain("readDeliveryViewerGate(meta) ?? predictedViewerGate");
  });
});

describe("F-09 공개 매장 API 500 고정 오류 코드", () => {
  it("/api/stores/[slug] DB 오류 → store_detail_failed (DB 문구 미노출)", async () => {
    h.storeRes = { ok: false, reason: "db_error", message: "permission denied for table stores" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getStoreDetail(new Request("http://x/api/stores/demo"), {
      params: Promise.resolve({ slug: "demo" }),
    });
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe("store_detail_failed");
    expect(JSON.stringify(json)).not.toContain("permission denied");
    spy.mockRestore();
  });

  it("summary 공유 fetch DB 오류 → store_summary_failed, 서버 로그 유지", async () => {
    h.storeRes = { ok: false, reason: "db_error", message: "permission denied for table stores" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await fetchStoreSummaryPublicShared({} as never, "demo");
    expect(out.status).toBe(500);
    expect((out.body as { error?: string }).error).toBe("store_summary_failed");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("summary·상세·home-feed catch 에 e.message 응답이 없다", () => {
    for (const p of [
      "app/api/stores/home-feed/route.ts",
      "app/api/stores/[slug]/route.ts",
      "app/api/stores/[slug]/summary/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src).not.toMatch(/error:\s*e instanceof Error \? e\.message/);
      expect(src).not.toMatch(/error:\s*storeRes\.message/);
    }
  });
});
