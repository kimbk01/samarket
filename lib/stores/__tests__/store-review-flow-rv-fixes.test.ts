import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("store review flow fixes (RV-01..RV-04)", () => {
  it("RV-01: no call to the non-existent review report endpoint and no fake 「접수」 alert", () => {
    const c = code("components/stores/StoreReviewsSection.tsx");
    expect(c).not.toContain("/api/me/store-reviews/report");
    expect(c).not.toContain("store_review_report_submitted");
  });

  it("RV-02 · RV-04: successful submit drops the order-detail and public review client caches", () => {
    const c = code("components/mypage/StoreOrderReviewForm.tsx");
    const ok = c.indexOf("dispatchWrittenReviewUpdated();");
    expect(ok).toBeGreaterThan(-1);
    const before = c.slice(Math.max(0, ok - 400), ok);
    expect(before).toContain("invalidateMeStoreOrderClientCaches(orderId)");
    expect(before).toContain("invalidateStoreReviewsPublicClientCaches()");
  });

  it("RV-03: submit is disabled while a photo uploads; upload appends to the current list", () => {
    const c = code("components/mypage/StoreOrderReviewForm.tsx");
    expect(c).toMatch(/disabled=\{busy \|\| uploadBusy \|\| submitGuard\.pending/);
    expect(c).not.toContain("const next: string[] = [...imageUrls]");
    expect(c).toContain("setImageUrls((prev) => [...prev, ...uploaded].slice(0, 3))");
  });

  it("RV-04: buyer review POST invalidates shared public caches like admin hide/restore", () => {
    const c = code("app/api/me/store-reviews/route.ts");
    expect(c).toContain('bumpStorePublicSharedCacheGeneration("store_review.created")');
    expect(c).toContain("clearStoreHomeFeedServerCache()");
  });
});

describe("RV-04 client review cache invalidation", () => {
  it("purges list + summary maps", async () => {
    const mod = await import("@/lib/stores/store-delivery-api-client");
    expect(typeof mod.invalidateStoreReviewsPublicClientCaches).toBe("function");
    expect(() => mod.invalidateStoreReviewsPublicClientCaches()).not.toThrow();
    const s = code("lib/stores/store-delivery-api-client.ts");
    const fn = s.slice(s.indexOf("export function purgeStoreSlugPublicClientCaches"));
    expect(fn.slice(0, 900)).toContain("storeReviewsPublicCache.delete(s)");
  });
});
