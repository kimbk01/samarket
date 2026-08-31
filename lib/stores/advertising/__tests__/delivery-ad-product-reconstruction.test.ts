import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  validateBannerCreativeGeometry,
  bannerGeometryRejectMessage,
} from "@/lib/stores/advertising/validate-banner-creative-geometry";
import { DELIVERY_AD_BANNER_PIXEL_GUIDE } from "@/lib/stores/advertising/delivery-ad-open-event-commercial";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Delivery Ads product reconstruction contracts", () => {
  it("T1 package duration uses t vars not .replace", () => {
    const grid = read("components/stores/advertising/DeliveryAdOwnerPackageCardGrid.tsx");
    expect(grid).toContain('t("owner_ads_period_duration_days", { days');
    expect(grid).not.toContain('.replace("{days}"');
    expect(grid).toContain('t("owner_ads_package_daily_avg", {');
    expect(grid).not.toContain('.replace("{amount}"');
  });

  it("T2 shared geometry validator HOME/SEARCH", () => {
    expect(
      validateBannerCreativeGeometry({
        inventoryKey: "STORES_HOME_HERO",
        width: 1560,
        height: 640,
      }).ok
    ).toBe(true);
    expect(
      validateBannerCreativeGeometry({
        inventoryKey: "STORES_HOME_HERO",
        width: 800,
        height: 200,
      }).ok
    ).toBe(false);
    expect(
      validateBannerCreativeGeometry({
        inventoryKey: "STORES_SEARCH_TOP",
        width: 1200,
        height: 400,
      }).ok
    ).toBe(true);
  });

  it("T3 Owner+Admin upload share geometry module", () => {
    expect(read("app/api/me/stores/[storeId]/delivery-ads/upload-banner-image/route.ts")).toContain(
      "validateBannerCreativeGeometry"
    );
    expect(read("app/api/admin/delivery-ads/upload-banner-image/route.ts")).toContain(
      "validateBannerCreativeGeometry"
    );
  });

  it("T4 zero-cash shortage modal on Owner create", () => {
    for (const f of [
      "components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx",
      "components/business/owner/ads/OwnerBannerCreateView.tsx",
    ]) {
      const src = read(f);
      expect(src).toContain("DeliveryAdOwnerInsufficientCashSubmitModal");
      expect(src).toContain("shortageModalOpen");
      expect(src).toContain("OWNER_STORE_ADMIN_FOOTER_INNER_CLASS");
      expect(src).not.toContain("충전하기");
    }
  });

  it("T5 confirm shows shortage not negative balance when underfunded", () => {
    const confirm = read("components/stores/advertising/DeliveryAdOwnerApplicationConfirm.tsx");
    expect(confirm).toContain("owner_ads_cash_shortage_amount");
    expect(confirm).toContain("data-owner-ads-cash-insufficient");
  });

  it("T6 credit vs cash copy present", () => {
    expect(read("components/business/owner/OwnerStorePointWarningCard.tsx")).toContain(
      "data-owner-credit-vs-cash"
    );
    expect(read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx")).toContain(
      "data-owner-ads-cash-wallet"
    );
  });

  it("T7 Admin first-party single-page + schedule + pixels", () => {
    const fp = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(fp).toContain('data-admin-first-party-wizard="single-page"');
    expect(fp).toContain("data-admin-fp-pixel-guide");
    expect(fp).toContain("data-admin-fp-schedule-invalid");
    expect(fp).not.toContain("DeliveryAdAdminFirstPartyStepProgress");
  });

  it("T8 human geometry reject copy", () => {
    const msg = bannerGeometryRejectMessage({
      error: "aspect_mismatch",
      guide: DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO,
      lang: "ko",
      placementLabel: "배달 홈 상단 배너",
    });
    expect(msg).toContain("39:16");
    expect(msg).toContain("1560");
  });

  it("T9 fund shortage shown; Stage 1 has no post-approval pay CTA", () => {
    const detail = read("components/business/owner/ads/OwnerDeliveryAdDetailView.tsx");
    expect(detail).toContain("data-owner-ads-fund-shortage");
    expect(detail).not.toContain("canPay");
    expect(detail).not.toContain("data-owner-ads-fund-cta");
    expect(detail).not.toContain("owner_ads_funding_pay_cta");
  });

  it("T10 pixel guide constants locked", () => {
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO.ratioLabel).toBe("39:16");
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO.recommendedWidth).toBe(1560);
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_SEARCH_TOP.ratioLabel).toBe("3:1");
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_SEARCH_TOP.recommendedWidth).toBe(1200);
  });
});
