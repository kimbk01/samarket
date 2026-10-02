import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/**
 * DEF-08 — Trade hosts must use Community FIX-8 pool contract:
 * one pool=1 fetch + campaignPool prop (no per-slot fetch).
 */
describe("trade feed ad pool wire contract (DEF-08)", () => {
  it("HomeProductList fetches pool=1 and passes campaignPool", () => {
    const src = read("components/home/HomeProductList.tsx");
    expect(src).toMatch(/pool:\s*["']1["']/);
    expect(src).toContain("campaignPool={feedAdPool ?? []}");
    expect(src).toContain('placement: "TRADE_HOME"');
    expect(src).toContain("runSingleFlight");
  });

  it("PostListByCategory fetches pool=1 and passes campaignPool", () => {
    const src = read("components/post/PostListByCategory.tsx");
    expect(src).toMatch(/pool:\s*["']1["']/);
    expect(src).toContain("campaignPool={feedAdPool ?? []}");
    expect(src).toContain('placement: "TRADE_CATEGORY"');
    expect(src).toContain("runSingleFlight");
  });

  it("FeedAdBannerCarousel skips HTTP when campaignPool is an array", () => {
    const src = read("components/ads/FeedAdBannerCarousel.tsx");
    expect(src).toContain("const usePool = Array.isArray(campaignPool)");
    expect(src).toMatch(/if \(usePool\) return;/);
  });
});
