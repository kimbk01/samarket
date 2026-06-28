import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStoreProductImageTransformUrl } from "@/lib/media/store-product-image-transform";
import {
  STORE_BANNER_HERO_FETCH_WIDTH_PX,
  imageBuildStoreBannerHeroFetchUrl,
  loadStoreBannerHeroFetchUrl,
} from "@/lib/image/image-store-banner-hero";

const BANNER_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/banner.webp";

describe("delivery banner hero transform (HeroSlideCover)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("object/public → render/image width=960 height=720 quality=80", () => {
    const out = imageBuildStoreBannerHeroFetchUrl(BANNER_RAW);
    expect(out).toContain("/storage/v1/render/image/public/store-product-images/");
    expect(out).toContain(`width=${STORE_BANNER_HERO_FETCH_WIDTH_PX}`);
    expect(out).toContain("height=720");
    expect(out).toContain("quality=80");
    expect(out).toContain("resize=cover");
  });

  it("loader matches builder", () => {
    expect(loadStoreBannerHeroFetchUrl(BANNER_RAW)).toBe(imageBuildStoreBannerHeroFetchUrl(BANNER_RAW));
  });

  it("external URL pass-through", () => {
    const ext = "https://cdn.example.com/banner.webp";
    expect(imageBuildStoreBannerHeroFetchUrl(ext)).toBe(ext);
  });

  it("legacy transform with same opts is byte-identical", () => {
    const adapter = imageBuildStoreBannerHeroFetchUrl(BANNER_RAW);
    const legacy = buildStoreProductImageTransformUrl(BANNER_RAW, {
      width: STORE_BANNER_HERO_FETCH_WIDTH_PX,
      height: 720,
      quality: 80,
    });
    expect(adapter).toBe(legacy);
  });
});
