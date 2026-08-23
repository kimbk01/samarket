import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStoreProductHeroDerivativeUrl,
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

  it("buildStoreProductHeroDerivativeUrl — canonical hero derivative", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    const out = buildStoreProductHeroDerivativeUrl(raw);
    expect(out).toContain("/object/public/store-product-images/s1/p1.hero.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("passes through non-storage URLs", () => {
    const ext = "https://cdn.example.com/thumb.webp";
    expect(buildStoreProductHeroDerivativeUrl(ext)).toBe(ext);
  });

  it("normalizes legacy render URLs to hero derivative", () => {
    const render =
      "https://abc.supabase.co/storage/v1/render/image/public/store-product-images/s1/p1.webp?width=96";
    const out = buildStoreProductHeroDerivativeUrl(render);
    expect(out).toContain(".hero.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("buildStoreProductThumbnailFetchUrl — object/public for list", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    const out = buildStoreProductThumbnailFetchUrl(raw, 92);
    expect(out).toBe(raw);
    expect(out).not.toContain("/render/image/");
  });

  it("buildStoreProductHeroFetchUrl — upload-time hero derivative", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/hero.webp";
    const out = buildStoreProductHeroFetchUrl(raw);
    expect(out).toContain(".hero.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("resolveStoreProductObjectPublicUrl — stable object path", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    expect(resolveStoreProductObjectPublicUrl(raw)).toBe(raw);
  });
});
