import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("admin direct unified flow contract", () => {
  it("CUT R2 — product selection hub separates Community/Trade/Delivery/Popup", () => {
    const source = read("components/admin/ads/AdminAdsDirectRegisterHub.tsx");
    expect(source).toContain('data-admin-ads-direct-flow="PRODUCT_SELECT_R2"');
    expect(source).toContain("data-admin-ads-direct-product={p.id}");
    expect(source).toContain('id: "community"');
    expect(source).toContain('id: "trade"');
    expect(source).toContain('id: "delivery"');
    expect(source).toContain('id: "popup"');
    expect(source).not.toContain("피드 배너");
    expect(source).toContain("data-admin-direct-store-promote-blocked");
    expect(source).toContain("/admin/advertising/direct/community");
    expect(source).toContain("/admin/advertising/direct/trade");
  });

  it("CUT R2 — Community/Trade restore AdminFeedAdCreatePage with upload+preview+confirm", () => {
    const feed = read("components/admin/ads/AdminFeedAdCreatePage.tsx");
    expect(feed).toContain("/api/admin/feed-ads/upload");
    expect(feed).toContain("FeedAdFramePreview");
    expect(feed).toContain("data-admin-feed-creative-spec");
    expect(feed).toContain("data-admin-feed-image-picker");
    expect(feed).toContain("AdminActionConfirmDialog");
    expect(feed).toContain("adsCreateConfirmCopy");
    expect(feed).toContain("/admin/advertising/operations");
    expect(feed).not.toContain('router.push("/admin/feed-ads")');
  });

  it("CUT R2 — Delivery/Popup direct create reuse existing writers/preview", () => {
    const delivery = read("components/admin/ads/AdminAdsDirectDeliveryCreateView.tsx");
    expect(delivery).toContain("/api/admin/delivery-ads/upload-banner-image");
    expect(delivery).toContain("/api/admin/delivery-ads/first-party");
    expect(delivery).toContain("DeliveryAdBanner");
    expect(delivery).toContain("data-admin-delivery-creative-spec");
    expect(delivery).toContain("AdminActionConfirmDialog");

    const popup = read("components/admin/ads/AdminAdsDirectPopupCreateView.tsx");
    expect(popup).toContain("/api/admin/advertising/direct-popup");
    expect(popup).toContain("AdminPlatformPopupPreview");
    expect(popup).toContain("data-admin-popup-creative-spec");
    expect(popup).toContain("36:25");
    expect(popup).toContain("1440");
  });
});
