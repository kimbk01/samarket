import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("admin direct unified flow contract", () => {
  it("keeps all seven registration steps in the direct page component", () => {
    const source = read("components/admin/ads/AdminAdsDirectRegisterHub.tsx");
    for (let step = 1; step <= 7; step += 1) {
      expect(source).toContain(`data-admin-direct-step="${step}"`);
    }
    expect(source).toContain('data-admin-ads-direct-flow="UNIFIED_7_STEP"');
  });

  it("dispatches to existing family writers without a link-card hub", () => {
    const source = read("components/admin/ads/AdminAdsDirectRegisterHub.tsx");
    expect(source).toContain("/api/admin/delivery-ads/first-party");
    expect(source).toContain("/api/admin/feed-ads");
    expect(source).toContain("/api/admin/advertising/direct-popup");
    expect(source).not.toContain('fetch("/api/admin/platform-popup-campaigns"');
    expect(source).not.toContain("/admin/delivery-ads/first-party/new");
    expect(source).not.toContain("/admin/feed-ads/new");
    expect(source).not.toMatch(/<Link[^>]+href=["']\/admin\/platform-popup["']/);
  });

  it("preserves the Store Promote direct block", () => {
    const source = read("components/admin/ads/AdminAdsDirectRegisterHub.tsx");
    expect(source).toContain("data-admin-direct-store-promote-blocked");
    expect(source).toContain("BLOCKED");
  });
});
