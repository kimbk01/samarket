import { describe, expect, it } from "vitest";
import {
  IMAGE_PRODUCT_TIERS,
  normalizeTierTransformDimensions,
  snapDeliveryPresetToProductTier,
  snapDisplayPxToProductTier,
  snapToProductTier,
} from "@/lib/image/image-tier";
import {
  buildFeedThumbnailFetchUrl,
} from "@/lib/media/feed-thumbnail-transform";
import {
  buildPostImageThumbnailFetchUrl,
  buildPostImageTransformUrl,
} from "@/lib/media/post-image-transform";
import {
  buildStoreProductHeroFetchUrl,
  buildStoreProductImageTransformUrl,
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
  deliveryImageFetchPxFromPreset,
  resolveStoreProductObjectPublicUrl,
} from "@/lib/media/store-product-image-transform";
import { currentImagePolicyMode, IMAGE_ADAPTER_PHASE } from "@/lib/image/image-policy";
import { DELIVERY_IMAGE_FETCH_PRESET } from "@/lib/media/store-product-image-transform";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/trade/item.jpg";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";

describe("Image Phase 2A — tier snap & transform reduction", () => {
  it("policy — phase 2 tier mode", () => {
    expect(IMAGE_ADAPTER_PHASE).toBe(2);
    expect(currentImagePolicyMode()).toBe("tier");
  });

  describe("snapToProductTier", () => {
    it("snaps to nearest upper tier", () => {
      expect(snapToProductTier(80)).toBe(320);
      expect(snapToProductTier(176)).toBe(320);
      expect(snapToProductTier(240)).toBe(320);
      expect(snapToProductTier(321)).toBe(640);
      expect(snapToProductTier(960)).toBe(1280);
      expect(snapToProductTier(2000)).toBe(1280);
    });

    it("display px retina → tier", () => {
      expect(snapDisplayPxToProductTier(88)).toBe(320);
      expect(snapDisplayPxToProductTier(120)).toBe(320);
    });
  });

  describe("delivery preset → tier", () => {
    const listPresets = Object.keys(DELIVERY_IMAGE_FETCH_PRESET).filter(
      (k) => k !== "detailHero" && k !== "heroTransition"
    );

    it.each(listPresets)("list preset %s → 320", (preset) => {
      expect(snapDeliveryPresetToProductTier(preset)).toBe(320);
      expect(deliveryImageFetchPxFromPreset(preset as keyof typeof DELIVERY_IMAGE_FETCH_PRESET)).toBe(320);
    });

    it("hero presets → 1280", () => {
      expect(snapDeliveryPresetToProductTier("detailHero")).toBe(1280);
      expect(snapDeliveryPresetToProductTier("heroTransition")).toBe(1280);
    });
  });

  describe("store-product list/card — object/public", () => {
    it("thumbnail fetch returns stable object URL", () => {
      const out = buildStoreProductThumbnailFetchUrl(STORE_RAW, 88);
      expect(out).toBe(STORE_RAW);
      expect(out).not.toContain("/render/image/");
    });

    it("menu preset returns object/public", () => {
      const out = buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "menu");
      expect(out).toBe(STORE_RAW);
      expect(out).not.toContain("/render/image/");
    });

    it("rowFeatured preset returns object/public", () => {
      const out = buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "rowFeatured");
      expect(out).toBe(STORE_RAW);
    });

    it("resolveStoreProductObjectPublicUrl strips render query", () => {
      const render =
        "https://abc.supabase.co/storage/v1/render/image/public/store-product-images/s1/p1.webp?width=96";
      const out = resolveStoreProductObjectPublicUrl(render);
      expect(out).toContain("/object/public/store-product-images/s1/p1.webp");
      expect(out).not.toContain("width=");
    });
  });

  describe("store-product hero — 1280 tier transform (exception)", () => {
    it("detail hero uses width=1280", () => {
      const out = buildStoreProductHeroFetchUrl(STORE_RAW);
      expect(out).toContain("/render/image/public/");
      expect(out).toContain("width=1280");
      expect(out).toContain("height=720");
    });

    it("heroTransition preset uses 1280 tier", () => {
      const out = buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "heroTransition");
      expect(out).toContain("width=1280");
    });
  });

  describe("post-images — tier transform only", () => {
    it("feed thumb uses width=320 (not 176/240)", () => {
      const out = buildPostImageThumbnailFetchUrl(POST_RAW, 120);
      expect(out).toContain("/render/image/public/post-images/");
      expect(out).toContain("width=320");
      expect(out).toContain("height=320");
      expect(out).not.toContain("width=240");
    });

    it("explicit 1280 gallery transform stays at 1280", () => {
      const out = buildPostImageTransformUrl(POST_RAW, { width: 1280, height: 1280 });
      expect(out).toContain("width=1280");
    });

    it("legacy small width snaps to 320", () => {
      const out = buildPostImageTransformUrl(POST_RAW, { width: 176, height: 176 });
      expect(out).toContain("width=320");
    });
  });

  describe("feed thumbnail — bucket routing", () => {
    it("store feed item → object/public", () => {
      const out = buildFeedThumbnailFetchUrl(STORE_RAW, 120);
      expect(out).toBe(STORE_RAW);
      expect(out).not.toContain("/render/image/");
    });

    it("post feed item → tier 320 transform", () => {
      const out = buildFeedThumbnailFetchUrl(POST_RAW, 120);
      expect(out).toContain("width=320");
    });
  });

  describe("normalizeTierTransformDimensions", () => {
    it("hero keeps height 720 at width 1280", () => {
      const dims = normalizeTierTransformDimensions({ width: 960, height: 720, quality: 80 });
      expect(dims.width).toBe(1280);
      expect(dims.height).toBe(720);
      expect(dims.quality).toBe(80);
    });

    it("product tiers are fixed set", () => {
      expect(IMAGE_PRODUCT_TIERS).toEqual([320, 640, 1280]);
    });
  });

  describe("store transform URL tier snap", () => {
    it("snaps arbitrary width to tier", () => {
      const out = buildStoreProductImageTransformUrl(STORE_RAW, { width: 232, height: 232 });
      expect(out).toContain("width=320");
    });
  });
});
