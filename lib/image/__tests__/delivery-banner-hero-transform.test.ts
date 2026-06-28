import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPostImageTransformUrl } from "@/lib/media/post-image-transform";
import {
  imageBuildStoreBannerHeroFetchUrl,
  loadStoreBannerHeroFetchUrl,
  STORE_BANNER_HERO_FETCH_WIDTH_PX,
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

  it("object/public → render/image width=1280 height=720 quality=80", () => {
    const out = imageBuildStoreBannerHeroFetchUrl(BANNER_RAW);
    expect(out).toContain("/storage/v1/render/image/public/store-product-images/");
    expect(out).toContain(`width=${STORE_BANNER_HERO_FETCH_WIDTH_PX}`);
    expect(out).toContain("height=720");
    expect(out).toContain("quality=80");
    expect(out).toContain("resize=cover");
    expect(STORE_BANNER_HERO_FETCH_WIDTH_PX).toBe(1280);
  });

  it("loader matches builder", () => {
    expect(loadStoreBannerHeroFetchUrl(BANNER_RAW)).toBe(imageBuildStoreBannerHeroFetchUrl(BANNER_RAW));
  });

  it("external URL pass-through", () => {
    const ext = "https://cdn.example.com/banner.webp";
    expect(imageBuildStoreBannerHeroFetchUrl(ext)).toBe(ext);
  });
});
