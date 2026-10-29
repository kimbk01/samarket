import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const policyState = { enabled: true };

vi.mock("@/lib/delivery/load-delivery-serviceability-runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/delivery/load-delivery-serviceability-runtime")>();
  return {
    ...actual,
    loadDeliveryServiceabilityRuntimeContext: vi.fn(async () => ({
      policy: {
        enabled: policyState.enabled,
        source: "haversine",
        defaultMaxKm: 5,
        overDistanceBehavior: "exclude",
      },
      overrides: { stores: {} },
    })),
  };
});

vi.mock("@/lib/delivery/service-area/load-store-service-area-runtime-map", () => ({
  loadStoreServiceAreaRuntimeMap: vi.fn(async () => new Map()),
}));

import { excludeViewerOutOfRangeBannerStores } from "@/lib/stores/advertising/banner-viewer-serviceability";

const NEAR = "11111111-1111-4111-8111-111111111111";
const FAR = "22222222-2222-4222-8222-222222222222";
const NO_COORDS = "33333333-3333-4333-8333-333333333333";

/** Manila origin; NEAR ≈ 1km, FAR ≈ Cebu (500km+). */
const ORIGIN = { lat: 14.5995, lng: 120.9842, canonicalLguId: null };

function storesClient(opts?: { error?: boolean }) {
  const rows = [
    { id: NEAR, lat: 14.6055, lng: 120.9842, delivery_radius_km: 5 },
    { id: FAR, lat: 10.3157, lng: 123.8854, delivery_radius_km: 5 },
    { id: NO_COORDS, lat: null, lng: null, delivery_radius_km: 5 },
  ];
  return {
    from(table: string) {
      expect(table).toBe("stores");
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              if (opts?.error) return Promise.resolve({ data: null, error: { message: "boom" } });
              return Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("ADC-04 — banners follow the store-list serviceability (same origin + SSOT)", () => {
  beforeEach(() => {
    policyState.enabled = true;
  });

  it("member with saved address: out-of-range / no-coords store banners excluded", async () => {
    const out = await excludeViewerOutOfRangeBannerStores(
      storesClient(),
      new Set([NEAR, FAR, NO_COORDS]),
      { source: "saved_address", ...ORIGIN }
    );
    expect([...out]).toEqual([NEAR]);
  });

  it("guest GPS / no origin / policy off: no exclusion (lists do not exclude either)", async () => {
    const all = new Set([NEAR, FAR]);
    expect(
      [...(await excludeViewerOutOfRangeBannerStores(storesClient(), all, { source: "explicit_coords", ...ORIGIN }))]
    ).toEqual([NEAR, FAR]);
    expect([...(await excludeViewerOutOfRangeBannerStores(storesClient(), all, null))]).toEqual([NEAR, FAR]);
    policyState.enabled = false;
    expect(
      [...(await excludeViewerOutOfRangeBannerStores(storesClient(), all, { source: "saved_address", ...ORIGIN }))]
    ).toEqual([NEAR, FAR]);
  });

  it("store lookup failure is fail-closed (store-linked banners hidden)", async () => {
    const out = await excludeViewerOutOfRangeBannerStores(
      storesClient({ error: true }),
      new Set([NEAR]),
      { source: "saved_address", ...ORIGIN }
    );
    expect(out.size).toBe(0);
  });

  it("all three banner APIs pass the store-list origin into the loaders", () => {
    for (const p of [
      "app/api/stores/home-hero-banners/route.ts",
      "app/api/stores/home-before-rest-banners/route.ts",
      "app/api/stores/browse-top-banners/route.ts",
    ]) {
      const src = readFileSync(p, "utf8");
      expect(src).toContain("resolveStoreListDeliveryOrigin(sb, req.nextUrl.searchParams)");
    }
    for (const p of [
      "lib/stores/load-store-banner-ad-campaigns.ts",
      "lib/stores/load-delivery-ad-physical-banners.ts",
    ]) {
      /** v4 PERF-14 — 자격 조회 행(좌표)을 재사용해 stores 재조회 없이 같은 OOR 판정 */
      expect(readFileSync(p, "utf8")).toContain("excludeViewerOutOfRangeBannerStores(sb, ids, viewerOrigin, storeRows)");
    }
  });
});

describe("ADC-03 — every hero slide records its own impression", () => {
  it("hero carousel remounts the banner per slide and the observer re-arms per exposure token", () => {
    const hero = readFileSync("components/stores/home/hub/StoresHomeHeroBanner.tsx", "utf8");
    expect(hero).toMatch(/<DeliveryAdBanner[\s\S]*?key=\{slide\.id\}/);
    const hook = readFileSync("components/stores/advertising/useDeliveryAdEvents.ts", "utf8");
    expect(hook).toContain("firedTokenRef.current !== props.exposureToken");
    expect(hook).toMatch(/firedTokenRef\.current = props\.exposureToken;\s*firedRef\.current = false;/);
  });
});

describe("ADC-09 — broken banner image hides the slot (no product placeholder + 「광고」)", () => {
  it("customer banner hides on image error and stops impressions; surfaces drop the slide", () => {
    const banner = readFileSync("components/stores/advertising/DeliveryAdBanner.tsx", "utf8");
    expect(banner).toContain("onImageError={");
    expect(banner).toContain('data-delivery-ad-asset-error={assetFailed ? "1" : undefined}');
    expect(banner).toContain("if (!assetUrl || assetFailed) {");
    expect(banner).toContain("enabled: isCustomer && Boolean(token) && !assetFailed");
    for (const p of [
      "components/stores/home/hub/StoresHomeHeroBanner.tsx",
      "components/stores/home/hub/StoresHomeBeforeRestBanner.tsx",
      "components/stores/browse/StoresBrowseTopBanner.tsx",
    ]) {
      expect(readFileSync(p, "utf8")).toContain("onAssetError={");
    }
  });
});
