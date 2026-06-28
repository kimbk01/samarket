import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStoreProductImageTransformUrl,
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductHeroFetchUrl,
  deliveryThumbFetchPx,
  resolveStoreProductObjectPublicUrl,
} from "@/lib/media/store-product-image-transform";

describe("store-product-image-transform", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("deliveryThumbFetchPx — Phase 2A tier snap", () => {
    expect(deliveryThumbFetchPx(56)).toBe(320);
    expect(deliveryThumbFetchPx(116)).toBe(320);
    expect(deliveryThumbFetchPx(300)).toBe(640);
  });

  it("buildStoreProductImageTransformUrl — tier-snapped render/image", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    const out = buildStoreProductImageTransformUrl(raw, { width: 232, height: 232 });
    expect(out).toContain("/storage/v1/render/image/public/store-product-images/s1/p1.webp");
    expect(out).toContain("width=320");
    expect(out).toContain("height=320");
    expect(out).toContain("resize=cover");
  });

  it("passes through non-storage URLs", () => {
    const ext = "https://cdn.example.com/thumb.webp";
    expect(buildStoreProductImageTransformUrl(ext, { width: 96 })).toBe(ext);
  });

  it("does not double-transform render URLs", () => {
    const render =
      "https://abc.supabase.co/storage/v1/render/image/public/store-product-images/s1/p1.webp?width=96";
    expect(buildStoreProductImageTransformUrl(render, { width: 96 })).toBe(render);
  });

  it("buildStoreProductThumbnailFetchUrl — object/public for list", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    const out = buildStoreProductThumbnailFetchUrl(raw, 92);
    expect(out).toBe(raw);
    expect(out).not.toContain("/render/image/");
  });

  it("buildStoreProductHeroFetchUrl — LCP preset 1280×720 q80", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/hero.webp";
    const out = buildStoreProductHeroFetchUrl(raw);
    expect(out).toContain("/render/image/public/");
    expect(out).toContain("width=1280");
    expect(out).toContain("height=720");
    expect(out).toContain("quality=80");
  });

  it("resolveStoreProductObjectPublicUrl — stable object path", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    expect(resolveStoreProductObjectPublicUrl(raw)).toBe(raw);
  });
});
