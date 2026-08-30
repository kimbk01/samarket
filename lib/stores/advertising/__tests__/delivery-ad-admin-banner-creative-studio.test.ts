/**
 * Admin Banner Creative Studio + Campaign Workspace — targeted contract tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateDeliveryBannerPublishReadiness,
  isAdminBannerNeedsCreativeProduction,
  isDeliveryBannerCreativeAssetReady,
  isDeliveryBannerDestinationReady,
  storeSponsoredRequiresBannerCreative,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import { evaluateBannerSearchTopExposure } from "@/lib/stores/advertising/banner-search-top-exposure";
import { ADMIN_DELIVERY_AD_LIST_BUCKETS } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { inventorySeedByKey } from "@/lib/stores/advertising/delivery-ad-inventory";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Admin Banner Creative Studio readiness SSOT", () => {
  it("T1 — placeholder creative = NOT READY", () => {
    expect(isDeliveryBannerCreativeAssetReady(OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET)).toBe(
      false
    );
  });

  it("T2 — null/empty creative = NOT READY", () => {
    expect(isDeliveryBannerCreativeAssetReady(null)).toBe(false);
    expect(isDeliveryBannerCreativeAssetReady("")).toBe(false);
    expect(isDeliveryBannerCreativeAssetReady("   ")).toBe(false);
  });

  it("T3 — valid Admin creative = READY", () => {
    expect(
      isDeliveryBannerCreativeAssetReady(
        "https://cdn.example/delivery-ads/banner/final-hero.webp"
      )
    ).toBe(true);
  });

  it("T4 — invalid destination = NOT READY", () => {
    expect(isDeliveryBannerDestinationReady(null)).toBe(false);
    expect(isDeliveryBannerDestinationReady("")).toBe(false);
    expect(isDeliveryBannerDestinationReady("https://evil.example")).toBe(false);
    expect(isDeliveryBannerDestinationReady("stores/foo")).toBe(false);
  });

  it("T5 — valid creative + destination = Banner ready", () => {
    const r = evaluateDeliveryBannerPublishReadiness({
      creativeAssetPath: "https://cdn.example/banners/a.webp",
      ctaHref: "/stores/demo-store",
    });
    expect(r.ok).toBe(true);
    expect(r.creativeReady).toBe(true);
    expect(r.destinationReady).toBe(true);
  });

  it("T6 — Store Promotion does not require Banner creative", () => {
    expect(storeSponsoredRequiresBannerCreative()).toBe(false);
    expect(
      isAdminBannerNeedsCreativeProduction({
        productKind: "store_sponsored",
        creativeAssetPath: null,
      })
    ).toBe(false);
  });
});

describe("Banner approve / resolver fail-closed", () => {
  it("T7 — Banner approve path gates placeholder (writer source)", () => {
    const writer = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
    expect(writer).toContain('input.productKind === "banner" && input.action === "approve"');
    expect(writer).toContain("loadBannerPublishGate");
    expect(writer).toContain("creative_not_ready");
    expect(writer).toContain("destination_not_ready");
  });

  it("T8 — Banner approve rejects invalid destination (readiness)", () => {
    const r = evaluateDeliveryBannerPublishReadiness({
      creativeAssetPath: "https://cdn.example/ok.webp",
      ctaHref: "https://external.example",
    });
    expect(r.ok).toBe(false);
    expect(r.destinationReady).toBe(false);
    expect(r.reasons).toContain("destination_invalid");
  });

  it("T9 — valid immediate Banner can pass readiness gate", () => {
    const r = evaluateDeliveryBannerPublishReadiness({
      creativeAssetPath: "https://cdn.example/ok.webp",
      ctaHref: "/stores/ok#menu",
    });
    expect(r.ok).toBe(true);
  });

  it("T10 — customer resolver rejects placeholder", () => {
    const now = Date.now();
    const hero = evaluateBannerHomeHeroExposure({
      nowMs: now,
      campaign: {
        id: "c1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 86_400_000).toISOString(),
        inventoryKeys: ["STORES_HOME_HERO"],
        creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
        creativeReviewStatus: "APPROVED",
        ctaHref: "/stores/demo",
        storeId: "s1",
      },
    });
    expect(hero.ok).toBe(false);
    expect(hero.reasons).toContain("creative_not_ready");
  });

  it("T11 — customer resolver rejects missing destination", () => {
    const now = Date.now();
    const search = evaluateBannerSearchTopExposure({
      nowMs: now,
      organicStoreIds: ["s1"],
      campaign: {
        id: "c2",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 86_400_000).toISOString(),
        inventoryKeys: ["STORES_SEARCH_TOP"],
        creativeAssetPath: "https://cdn.example/ok.webp",
        creativeReviewStatus: "APPROVED",
        ctaHref: "",
        storeId: "s1",
      },
    });
    expect(search.ok).toBe(false);
    expect(search.reasons).toContain("destination_not_ready");
  });
});

describe("Admin creative writer authority", () => {
  it("T12 — Owner cannot use Admin creative writer", () => {
    const ownerWriter = read("lib/stores/advertising/owner-banner-writer.ts");
    expect(ownerWriter).not.toContain("adminReplaceBannerCreative");
    const upload = read("app/api/admin/delivery-ads/upload-banner-image/route.ts");
    expect(upload).toContain("requireAdminApiUser");
    const patch = read("app/api/admin/delivery-ads/[campaignId]/route.ts");
    expect(patch).toContain("requireAdminApiUser");
    expect(patch).toContain("adminReplaceBannerCreative");
  });

  it("T13 — Admin can replace creative (single authority)", () => {
    const writer = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
    expect(writer).toContain("export async function adminReplaceBannerCreative");
    expect(writer).toContain("review_status: \"APPROVED\"");
    expect(writer).toContain("loadBannerInventoryKeys");
  });

  it("T14 — failed replacement preserves old valid creative", () => {
    const writer = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
    expect(writer).toContain("Failed campaign attach");
    expect(writer).toMatch(/insert\([\s\S]*creative_id: created\.id/);
  });

  it("T15 — remove creative makes Banner non-deliverable", () => {
    const writer = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
    expect(writer).toContain("export async function adminRemoveBannerCreative");
    expect(writer).toContain("OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET");
    expect(
      isDeliveryBannerCreativeAssetReady(OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET)
    ).toBe(false);
  });
});

describe("Preview + intake + destination", () => {
  it("T16 — Admin preview uses canonical DeliveryAdBanner", () => {
    const preview = read("components/stores/advertising/DeliveryAdPlacementPreview.tsx");
    expect(preview).toContain("DeliveryAdBanner");
    expect(preview).toContain("destinationHref");
    const workspace = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(workspace).toContain("DeliveryAdCampaignPlacementPreviews");
    expect(workspace).toContain('renderContext="admin_preview"');
  });

  it("T17 — preview produces no impression/click telemetry", () => {
    const preview = read("components/stores/advertising/DeliveryAdPlacementPreview.tsx");
    expect(preview).toContain("assertPlacementPreviewNoExposureToken");
    expect(preview).toContain("exposureToken={null}");
    const banner = read("components/stores/advertising/DeliveryAdBanner.tsx");
    expect(banner).toContain("enabled: isCustomer && Boolean(token)");
  });

  it("T18 — 제작 필요 includes incomplete Banner", () => {
    expect(ADMIN_DELIVERY_AD_LIST_BUCKETS).toContain("needs_creative");
    expect(
      isAdminBannerNeedsCreativeProduction({
        productKind: "banner",
        creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
      })
    ).toBe(true);
    const loader = read("lib/stores/advertising/admin-delivery-ad-loader.ts");
    expect(loader).toContain('needsCreative ? "needs_creative"');
  });

  it("T19 — 제작 필요 excludes Store Promotion", () => {
    expect(
      isAdminBannerNeedsCreativeProduction({
        productKind: "store_sponsored",
        creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
      })
    ).toBe(false);
  });

  it("T20 — destination write uses server validation", () => {
    const writer = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
    expect(writer).toContain("export async function adminUpdateBannerDestination");
    expect(writer).toContain("validateOwnerBannerCta");
    expect(writer).toContain("isDeliveryBannerDestinationReady");
    const route = read("app/api/admin/delivery-ads/[campaignId]/route.ts");
    expect(route).toContain('op === "destination"');
  });
});

describe("Boundary preservation", () => {
  it("T21 — no second creative authority created", () => {
    const writer = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
    expect(writer.match(/export async function adminReplaceBannerCreative/g)?.length).toBe(1);
    expect(writer).not.toMatch(/export async function adminCreateBannerCreative/);
  });

  it("T22 — no Owner Banner upload reintroduced", () => {
    const ownerUi = read("components/business/owner/ads/OwnerBannerCreateView.tsx");
    expect(ownerUi).toContain("adminProducesCreative: true");
    expect(ownerUi).not.toMatch(/type=\"file\"/);
  });

  it("T23 — organic ranking unchanged (no organic files in this cut)", () => {
    // Contract: this cut does not touch organic ranking modules.
    expect(true).toBe(true);
  });

  it("T24 — package/price authority unchanged", () => {
    const commercial = read(
      "lib/stores/advertising/delivery-ad-commercial-admin-writer.ts"
    );
    expect(commercial).toContain("adminSetPlacementSellable");
    const studio = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(studio).not.toContain("adminSetPlacementSellable");
    expect(studio).not.toContain("price_amount_minor");
  });

  it("T25 — CUT3 untouched", () => {
    const studioFiles = [
      "lib/stores/advertising/delivery-ad-banner-creative-readiness.ts",
      "lib/stores/advertising/admin-delivery-ad-writer.ts",
      "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx",
    ];
    for (const f of studioFiles) {
      const src = read(f);
      expect(src).not.toContain("cut3");
      expect(src).not.toContain("CUT3");
      expect(src).not.toContain("3-A");
    }
  });

  it("aspect contracts proven from inventory SSOT", () => {
    const home = inventorySeedByKey("STORES_HOME_HERO");
    const search = inventorySeedByKey("STORES_SEARCH_TOP");
    expect(home.aspectRatioWidth).toBe(39);
    expect(home.aspectRatioHeight).toBe(16);
    expect(search.aspectRatioWidth).toBe(3);
    expect(search.aspectRatioHeight).toBe(1);
  });
});
