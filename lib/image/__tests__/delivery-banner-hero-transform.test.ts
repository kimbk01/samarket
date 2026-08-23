import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  imageBuildStoreBannerHeroFetchUrl,
  loadStoreBannerHeroFetchUrl,
  STORE_BANNER_HERO_FETCH_WIDTH_PX,
} from "@/lib/image/image-store-banner-hero";

const BANNER_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/banner.webp";

describe("delivery banner hero (HeroSlideCover)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("object/public → upload-time hero derivative", () => {
    const out = imageBuildStoreBannerHeroFetchUrl(BANNER_RAW);
    expect(out).toContain("/object/public/store-product-images/");
    expect(out).toContain(".hero.webp");
    expect(out).not.toContain("/render/image/");
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
