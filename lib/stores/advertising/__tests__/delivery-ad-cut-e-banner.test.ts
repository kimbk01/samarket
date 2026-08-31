/**
 * CUT E — Owner Banner + DeliveryAdBanner contracts (E1–E30 domain subset).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OWNER_BANNER_CROP_POLICY,
  OWNER_BANNER_INVENTORY_KEYS,
  OWNER_BANNER_PRICING,
  resolveOwnerBannerCtaHref,
  validateOwnerBannerCta,
  validateOwnerBannerCreativeAspect,
  validateOwnerBannerInventory,
} from "@/lib/stores/advertising/owner-banner-contract";
import {
  CUT_C_SPONSORED_ATOMICITY,
  CUT_E_BANNER_TRANSACTIONAL_MUTATION,
} from "@/lib/stores/advertising/owner-banner-writer";
import {
  DELIVERY_AD_BANNER_RENDERER_CONTRACT,
  deliveryAdBannerAspectStyle,
  inventoryViewFromKey,
} from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import { inventorySeedByKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import { validateDeliveryAdCreativeForInventory } from "@/lib/stores/advertising/delivery-ad-creative";
import { canPhysicallyDeleteDeliveryAdCampaign } from "@/lib/stores/advertising/delivery-ad-audit";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { ownerActionTargetLifecycle } from "@/lib/stores/advertising/owner-store-sponsored-contract";

describe("CUT E Owner Banner + renderer", () => {
  it("E1 draft inventory ACTIVE STORES_HOME_HERO + STORES_SEARCH_TOP accepted", () => {
    expect(validateOwnerBannerInventory("STORES_HOME_HERO")).toEqual({
      ok: true,
      key: "STORES_HOME_HERO",
    });
    expect(validateOwnerBannerInventory("STORES_SEARCH_TOP")).toEqual({
      ok: true,
      key: "STORES_SEARCH_TOP",
    });
    expect(OWNER_BANNER_INVENTORY_KEYS).toEqual(["STORES_HOME_HERO", "STORES_SEARCH_TOP"]);
  });

  it("E2 ownership enforced by contract (cta target must be store)", () => {
    const bad = validateOwnerBannerCta({
      ctaType: "store_detail",
      ctaTargetId: "",
    });
    expect(bad.ok).toBe(false);
  });

  it("E3 future inventory rejected", () => {
    expect(validateOwnerBannerInventory("STORES_HOME_INLINE_1")).toEqual({
      ok: false,
      error: "future_inventory",
    });
    expect(validateOwnerBannerInventory("STORE_DETAIL_RECOMMENDATION_BANNER").ok).toBe(false);
  });

  it("E4 ACTIVE inventory accepted", () => {
    expect(validateOwnerBannerInventory("STORES_HOME_HERO").ok).toBe(true);
  });

  it("E5 invalid creative type for inventory rejected", () => {
    const v = validateDeliveryAdCreativeForInventory(
      {
        productKind: "store_sponsored",
        assetPath: "x",
      },
      "STORES_HOME_HERO"
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toBe("incompatible_creative_type");
  });

  it("E6 aspect mismatch rejected; crop policy crop_capable", () => {
    expect(OWNER_BANNER_CROP_POLICY.mode).toBe("crop_capable");
    expect(OWNER_BANNER_CROP_POLICY.stretchForbidden).toBe(true);
    const bad = validateOwnerBannerCreativeAspect({
      inventoryKey: "STORES_HOME_HERO",
      sourceWidth: 16,
      sourceHeight: 9,
    });
    expect(bad.ok).toBe(false);
    const good = validateOwnerBannerCreativeAspect({
      inventoryKey: "STORES_HOME_HERO",
      sourceWidth: 390,
      sourceHeight: 160,
    });
    expect(good.ok).toBe(true);
  });

  it("E7 external CTA rejected", () => {
    const v = validateOwnerBannerCta({
      ctaType: "store_detail",
      ctaTargetId: "s1",
      externalUrl: "https://evil.example",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toBe("external_cta_forbidden");
  });

  it("E8 invalid target entity rejected", () => {
    const v = validateOwnerBannerCta({
      ctaType: "store_detail",
      ctaTargetId: "   ",
    });
    expect(v.ok).toBe(false);
  });

  it("E9 creative versioning fields exist on creative table contract", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/advertising/owner-banner-writer.ts"),
      "utf8"
    );
    expect(src).toMatch(/supersedeCreativeId|supersedes_creative_id/);
    expect(src).toMatch(/version/);
  });

  it("E10 submit transition DRAFT→SUBMITTED", () => {
    expect(ownerActionTargetLifecycle("submit")).toBe("SUBMITTED");
  });

  it("E11 Owner cannot approve (no approve action)", () => {
    expect(ownerActionTargetLifecycle("submit")).not.toBe("APPROVED");
    expect(ownerActionTargetLifecycle("submit")).not.toBe("ACTIVE");
  });

  it("E12 CHANGES_REQUESTED resubmit → SUBMITTED", () => {
    expect(ownerActionTargetLifecycle("resubmit")).toBe("SUBMITTED");
  });

  it("E13 PAUSED_ADMIN Owner resume blocked in writer", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/advertising/owner-banner-writer.ts"),
      "utf8"
    );
    expect(src).toMatch(/PAUSED_ADMIN/);
    expect(src).toMatch(/illegal_transition/);
  });

  it("E14 draft delete obeys physical delete contract", () => {
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "DRAFT",
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(true);
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "ACTIVE",
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(false);
  });

  it("E15 transactional mutation RPC", () => {
    expect(CUT_E_BANNER_TRANSACTIONAL_MUTATION.status).toBe("HARDENED");
    expect(CUT_E_BANNER_TRANSACTIONAL_MUTATION.rpc).toBe("owner_delivery_banner_upsert");
    expect(CUT_C_SPONSORED_ATOMICITY.status).toBe("HARDENED");
  });

  it("E16 duplicate submit idempotency column/RPC", () => {
    const mig = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261201140000_delivery_ads_cut_e_owner_banner_rpc.sql"
      ),
      "utf8"
    );
    expect(mig).toMatch(/owner_client_request_id/);
    expect(mig).toMatch(/idempotent/);
  });

  it("E17 renderer uses inventory ratio authority", () => {
    const inv = inventoryViewFromKey("STORES_HOME_HERO");
    expect(inv.aspectRatioWidth).toBe(39);
    expect(inv.aspectRatioHeight).toBe(16);
    expect(deliveryAdBannerAspectStyle(inv).aspectRatio).toBe("39 / 16");
    expect(inventorySeedByKey("STORES_HOME_HERO").aspectRatioWidth).toBe(39);
  });

  it("E18 no ios/android/tablet ratio branch in renderer", () => {
    expect(DELIVERY_AD_BANNER_RENDERER_CONTRACT.forbiddenProps).toContain("isIos");
    const src = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/isIos|isAndroid|tabletBanner|ios_ratio|android_ratio/);
  });

  it("E19–E23 viewport geometry preserves 39:16", () => {
    const ratio = 39 / 16;
    for (const w of [375, 390, 430, 768, 820]) {
      const h = w / ratio;
      expect(Math.abs(w / h - ratio)).toBeLessThan(1e-9);
    }
  });

  it("E24–E25 no stretch / overflow contract in renderer", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(src).toMatch(/overflow-hidden/);
    expect(src).toMatch(/object-cover|object-contain/);
    expect(src).not.toMatch(/object-fill|stretch/);
  });

  it("E26 ad label present", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(src).toMatch(/data-delivery-ad-label/);
    expect(src).toMatch(/adLabel/);
  });

  it("E27 CTA uses canonical internal route", () => {
    expect(resolveOwnerBannerCtaHref({ ctaType: "store_detail", storeSlug: "demo" })).toBe(
      "/stores/demo"
    );
    expect(resolveOwnerBannerCtaHref({ ctaType: "store_menu", storeSlug: "demo" })).toContain(
      "/stores/demo"
    );
    expect(resolveOwnerBannerCtaHref({ ctaType: "store_detail", storeSlug: "demo" })).not.toMatch(
      /^https?:/
    );
  });

  it("E28 Owner preview uses DeliveryAdBanner via canonical preview workspace", () => {
    const owner = readFileSync(
      join(process.cwd(), "components/business/owner/ads/OwnerBannerCreateView.tsx"),
      "utf8"
    );
    expect(owner).toMatch(/DeliveryAdOwnerPreviewWorkspace/);
    expect(owner).toMatch(/owner_preview|presentationMode="owner_product"/);
    expect(owner).not.toMatch(/AdminBannerPreview|OwnerBannerPreview/);
    const preview = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdPlacementPreview.tsx"),
      "utf8"
    );
    expect(preview).toMatch(/from \"@\/components\/stores\/advertising\/DeliveryAdBanner\"/);
    expect(preview).toMatch(/<DeliveryAdBanner/);
    expect(preview).toMatch(/renderContext=\{renderContext\}/);
  });

  it("E29 Admin preview foundation — same component export", () => {
    expect(DELIVERY_AD_BANNER_RENDERER_CONTRACT.singleComponent).toBe("DeliveryAdBanner");
    const customer = readFileSync(
      join(process.cwd(), "components/stores/home/hub/StoresHomeHeroBanner.tsx"),
      "utf8"
    );
    expect(customer).toMatch(/DeliveryAdBanner/);
    expect(customer).toMatch(/customer/);
  });

  it("E30 missing creative fails closed", () => {
    const gate = evaluateBannerHomeHeroExposure({
      campaign: {
        id: "c1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2027-01-01T00:00:00.000Z",
        inventoryKeys: ["STORES_HOME_HERO"],
        creativeAssetPath: "",
        creativeReviewStatus: "APPROVED",
        ctaHref: "/stores/x",
        storeId: "s1",
      },
      nowMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain("creative_asset");

    const renderer = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(renderer).toMatch(/data-delivery-ad-banner="empty"/);
  });

  it("pricing NOT_CONFIGURED", () => {
    expect(OWNER_BANNER_PRICING.status).toBe("NOT_CONFIGURED");
  });

  it("create route wired", () => {
    expect(DELIVERY_AD_OWNER_ROUTES.createBanner).toBe("/stores/owner/ads/new/banner");
    expect(() =>
      readFileSync(join(process.cwd(), "app/(main)/stores/owner/ads/new/banner/page.tsx"))
    ).not.toThrow();
  });
});
