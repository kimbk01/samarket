import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

describe("resolveStoreProductMediaUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("development — keeps local Supabase storage URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const local =
      "http://127.0.0.1:54321/storage/v1/object/public/store-product-images/s1/p1.webp";
    expect(resolveStoreProductMediaUrl(local)).toBe(local);
  });

  it("production — rewrites LAN host to Supabase public origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const out = resolveStoreProductMediaUrl(
      "http://192.168.100.7:3000/storage/v1/object/public/store-product-images/s1/p1.webp"
    );
    expect(out).toBe(
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp"
    );
  });

  it("keeps cloud Supabase URL in all environments", () => {
    vi.stubEnv("NODE_ENV", "development");
    const cloud =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    expect(resolveStoreProductMediaUrl(cloud)).toBe(cloud);
  });

  it("assembles bare object path", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(resolveStoreProductMediaUrl("s1/p1.webp")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp"
    );
  });
});
