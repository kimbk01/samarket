/**
 * v4 재감사 보완 r2 — PERF-14 업종 상단 배너 서버 캐시·세대 purge, 업종 이미지 업로드 세대 bump,
 * UI-15·16 PHT 입력 왕복, PERF-07 홈 피드 매장별 상품 상한.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ policy: 0, slides: 0, origin: "saved_address" as string }));

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  syncStorePublicReadCachesWithSharedGeneration: async () => {},
}));
vi.mock("@/lib/stores/store-list-delivery-origin", () => ({
  resolveStoreListDeliveryOrigin: async () => ({
    source: calls.origin,
    userId: calls.origin === "none" ? null : "user-secret-id",
    addressId: "addr-secret",
    placeId: null,
    lat: 14.5547,
    lng: 121.0244,
    addressIdentity: null,
    canonicalLguId: "lgu-1",
    cacheKeyPart: "addr:user-secret-id",
  }),
}));
vi.mock("@/lib/stores/product/stores-browse-scope-policy-db", () => ({
  listBrowseScopePolicyRows: async () => {
    calls.policy += 1;
    return [];
  },
  mapBrowseScopeDbRow: (r: unknown) => r,
}));
vi.mock("@/lib/stores/product/stores-browse-scope-policy-catalog", () => ({
  buildBrowsePrimaryScopeKey: (p: string) => `p:${p}`,
  buildBrowseSubScopeKey: (p: string, s: string) => `s:${p}:${s}`,
  resolveBrowseScopePolicy: () => ({ bannerAds: { enabled: true, capacity: 3, position: "top" } }),
}));
vi.mock("@/lib/stores/product/stores-browse-scope-visibility", () => ({
  isBrowseScopeCustomerVisible: () => true,
}));
vi.mock("@/lib/stores/load-delivery-ad-physical-banners", () => ({
  loadVisiblePhysicalBannerSlides: async () => {
    calls.slides += 1;
    return [
      {
        id: "camp-1",
        imageUrl: "https://img.test/b.jpg",
        title: "T",
        subtitle: null,
        ctaHref: "/stores/s",
        sortOrder: 1,
        inventoryKey: "STORES_CATEGORY_TOP",
        aspectRatioWidth: 16,
        aspectRatioHeight: 9,
        cropPolicy: "cover",
        objectPosition: "center",
        creativeId: "cr-1",
        exposureToken: "loader-token",
        storeId: "store-1",
        isSampleStore: false,
      },
    ];
  },
}));

import { NextRequest } from "next/server";
import { GET as getBanners } from "@/app/api/stores/browse-top-banners/route";
import {
  buildStoreBrowseTopBannersCacheKey,
  clearStoreBrowseTopBannersServerCache,
  storeBrowseTopBannersServerCacheSizeForTests,
} from "@/lib/stores/store-browse-top-banners-server-cache";
import { purgeAllStorePublicServerMemoryCaches } from "@/lib/stores/store-public-server-memory-purge";
import { verifyDeliveryAdExposureToken } from "@/lib/stores/advertising/delivery-ad-exposure-token";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { capHomeFeedProductsPerStore } from "@/lib/stores/store-home-feed-product-fetch-cap";

const req = (q: string) => new NextRequest(`https://x.test/api/stores/browse-top-banners?${q}`);
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

beforeEach(() => {
  calls.policy = 0;
  calls.slides = 0;
  calls.origin = "saved_address";
  clearStoreBrowseTopBannersServerCache();
});

describe("PERF-14 — 업종 상단 배너 서버 캐시", () => {
  it("같은 업종·origin 반복 요청은 정책·배너 조회 1회, 노출 토큰은 매 요청 새로 발급", async () => {
    const a = await (await getBanners(req("primary=food&sub=korean"))).json();
    const b = await (await getBanners(req("primary=food&sub=korean"))).json();
    expect(calls.policy).toBe(1);
    expect(calls.slides).toBe(1);
    expect(a.banners).toHaveLength(1);
    expect(b.banners[0].id).toBe("camp-1");
    const ta = a.banners[0].exposureToken as string;
    const tb = b.banners[0].exposureToken as string;
    expect(ta).toBeTruthy();
    expect(ta).not.toBe("loader-token");
    expect(ta).not.toBe(tb);
    const v = verifyDeliveryAdExposureToken(tb);
    expect(v.ok).toBe(true);
    expect(a).toMatchObject({ ok: true, physicalEnabled: true, position: "top", capacity: 3 });
  });

  it("업종이 다르면 다른 키 (2차 업종 포함)", async () => {
    await getBanners(req("primary=food&sub=korean"));
    await getBanners(req("primary=food&sub=chinese"));
    await getBanners(req("primary=food"));
    expect(calls.slides).toBe(3);
  });

  it("게이트 미통과(비로그인)는 캐시를 쓰지 않고 빈 배너", async () => {
    calls.origin = "none";
    const j = await (await getBanners(req("primary=food"))).json();
    expect(j).toMatchObject({ ok: true, banners: [], meta: { viewer_gate: "login_required" } });
    expect(calls.policy).toBe(0);
    expect(storeBrowseTopBannersServerCacheSizeForTests()).toBe(0);
  });

  it("캐시 키에 사용자·주소 id 없음 (origin 지역 필드만)", () => {
    const key = buildStoreBrowseTopBannersCacheKey({
      primary: "food",
      sub: "korean",
      origin: { source: "saved_address", lat: 14.5547, lng: 121.0244, canonicalLguId: "lgu-1" },
    });
    expect(key).toBe("food|korean|saved_address|14.554700|121.024400|lgu-1");
    expect(key).not.toContain("user");
  });

  it("세대 purge(purgeAllStorePublicServerMemoryCaches)가 배너 캐시도 비운다", async () => {
    await getBanners(req("primary=food"));
    expect(storeBrowseTopBannersServerCacheSizeForTests()).toBe(1);
    purgeAllStorePublicServerMemoryCaches();
    expect(storeBrowseTopBannersServerCacheSizeForTests()).toBe(0);
    await getBanners(req("primary=food"));
    expect(calls.slides).toBe(2);
  });
});

describe("업종 이미지 업로드 — 성공 후 공유 세대 bump", () => {
  it("DB 갱신 성공(not_found 확인) 뒤 bumpStorePublicSharedCacheGeneration 호출", () => {
    const src = read("app/api/admin/stores/taxonomy/upload-image/route.ts");
    expect(src).toContain('import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation"');
    const notFound = src.indexOf('error: "not_found"');
    const bump = src.indexOf('bumpStorePublicSharedCacheGeneration("store_taxonomy.upload_image")');
    const ok = src.indexOf("return NextResponse.json({ ok: true, kind, id, url: publicUrl })");
    expect(notFound).toBeGreaterThan(0);
    expect(bump).toBeGreaterThan(notFound);
    expect(ok).toBeGreaterThan(bump);
  });
});

describe("UI-15·16 — 관리자 광고 시각 입력 PHT 고정", () => {
  it("ISO ↔ PHT datetime-local 왕복 (기기 시간대 무관)", () => {
    expect(adminIsoToManilaInput("2026-10-29T01:00:00.000Z")).toBe("2026-10-29T09:00");
    expect(adminManilaInputToIso("2026-10-29T09:00")).toBe("2026-10-29T01:00:00.000Z");
    const orig = "2026-10-29T01:00:30.000Z";
    expect(adminManilaInputToIso(adminIsoToManilaInput(orig), orig)).toBe(orig);
  });

  it.each([
    "components/admin/stores/AdminStoreBannerAdWriterPanel.tsx",
    "components/admin/stores/AdminStorePaidAdWriterPanel.tsx",
  ])("%s — 공용 PHT 변환 사용, 기기 시간대 getHours 없음", (rel) => {
    const src = read(rel);
    expect(src).toContain("adminIsoToManilaInput(iso)");
    expect(src).toContain("adminManilaInputToIso(value, originalIso)");
    expect(src).not.toMatch(/\.getHours\(\)/);
    expect(src).toContain("fromDatetimeLocal(editForm.startAt, editingRow?.start_at)");
  });

  it("직접 등록 화면 즉시/예약 판정은 PHT 해석", () => {
    const src = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(src).toContain('Date.parse(manilaLocalToIso(startAt) ?? "") <= Date.now()');
    expect(src).not.toContain("new Date(startAt).getTime() <= Date.now()");
  });
});

describe("PERF-07 — 홈 피드 매장별 상품 상한", () => {
  it("정렬 순서를 유지하며 매장별 앞쪽 20개만 남긴다", () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, store_id: "A" })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, store_id: "B" })),
    ];
    const out = capHomeFeedProductsPerStore(rows);
    expect(out.filter((r) => r.store_id === "A")).toHaveLength(20);
    expect(out.filter((r) => r.store_id === "B")).toHaveLength(5);
    expect(out[0].id).toBe("a0");
    expect(out[19].id).toBe("a19");
    expect(out[20].id).toBe("b0");
  });

  it("홈 피드 라우트가 노출 판정 뒤 매장별 상한을 적용", () => {
    const src = read("app/api/stores/home-feed/route.ts");
    expect(src).toMatch(/capHomeFeedProductsPerStore\(\s*\(\(prods \?\? \[\]\) as ProductMini\[\]\)\.filter/);
  });
});
