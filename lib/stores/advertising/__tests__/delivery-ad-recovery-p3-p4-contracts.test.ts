import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { STORES_SEARCH_TOP_SLOT_POLICY } from "@/lib/stores/advertising/banner-search-top-exposure";
import { launchBannerByInventory } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Delivery Ads Recovery P3–P4 Admin/Customer contracts", () => {
  it("exposes inventory admin route", () => {
    expect(DELIVERY_AD_ADMIN_ROUTES.inventory).toBe("/admin/delivery-ads/inventory");
    expect(read("app/admin/delivery-ads/inventory/page.tsx")).toContain(
      "AdminDeliveryAdInventoryManagementView"
    );
  });

  it("Admin section nav is tab-style with separated primary create", () => {
    const nav = read("components/admin/stores/AdminDeliveryAdsSectionNav.tsx");
    expect(nav).toContain("data-admin-delivery-ads-section-nav");
    expect(nav).toContain('data-admin-delivery-ads-nav-layout="tabs-plus-primary"');
    expect(nav).toContain("지면 관리");
    expect(nav).toContain("data-admin-ads-nav-primary-create");
    expect(nav).toContain("디바이 광고 만들기");
    expect(nav).not.toMatch(/className=.*underline/);
    expect(nav).toContain("focus-visible:ring");
    for (const f of [
      "components/admin/stores/AdminDeliveryAdsControlPlane.tsx",
      "components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx",
      "components/admin/stores/AdminDeliveryAdInventoryManagementView.tsx",
      "components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx",
      "components/admin/stores/AdminDeliveryAdBannerStudioView.tsx",
      "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx",
    ]) {
      expect(read(f)).toContain("AdminDeliveryAdsSectionNav");
    }
  });

  it("Partner page rejects ambiguous underline primary nav and uses selected filters", () => {
    const partner = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
    expect(partner).toContain("data-admin-partner-filters");
    expect(partner).toContain("aria-selected");
    expect(partner).toContain("Partner 월 회비 자동 결제");
    expect(partner).not.toMatch(/className="text-signature underline"/);
  });

  it("Banner Studio has request summary + PC upload pipeline markers", () => {
    const studio = read("components/admin/stores/AdminDeliveryAdBannerStudioView.tsx");
    expect(studio).toContain("data-admin-banner-request-summary");
    expect(studio).toContain("data-admin-banner-pc-upload");
    expect(studio).toContain("/api/admin/delivery-ads/upload-banner-image");
    expect(studio).toContain("이미지 변경");
    expect(studio).toContain("이미지 삭제");
  });

  it("Admin campaign funding exposes AST-005 Business Cash authority (not Store Cash / fake top-up)", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("data-admin-business-cash-credit");
    expect(detail).toContain("data-admin-ast005-authority");
    expect(detail).toContain("Business Cash (AST-005)");
    expect(detail).not.toContain("data-admin-store-cash-authority");
    expect(detail).not.toContain("Business Cash 지급");
    expect(detail).not.toMatch(/가짜 충전|\[충전\]/);
  });

  it("SEARCH TOP maxBanners is 1 and Admin inventory surfaces it", () => {
    expect(STORES_SEARCH_TOP_SLOT_POLICY.maxBanners).toBe(1);
    const inv = read("components/admin/stores/AdminDeliveryAdInventoryManagementView.tsx");
    expect(inv).toContain("data-admin-search-max");
    expect(inv).toContain("STORES_SEARCH_TOP_SLOT_POLICY");
  });

  it("HOME HERO customer carousel uses launch autoSlideMs + dots UI", () => {
    const hero = launchBannerByInventory("STORES_HOME_HERO");
    expect(hero?.autoSlideMs).toBe(5000);
    expect(hero?.dotsRequired).toBe(true);
    const ui = read("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    expect(ui).toContain("data-stores-home-hero-dots-ui");
    expect(ui).toContain("launchBannerByInventory");
    expect(ui).toContain("onTouchEnd");
  });

  it("P5 Owner primary button + footer gap + tablet width contracts", () => {
    const btn = read("lib/stores/advertising/delivery-ad-owner-ui-presentation.ts");
    expect(btn).toContain("hover:bg-[#087a38]");
    expect(btn).toContain("active:scale-[0.99]");
    expect(btn).toContain("focus-visible:ring-2");
    expect(btn).toContain("disabled:opacity-50");
    const footer = read("lib/business/owner-admin-form-keyboard.ts");
    expect(footer).toContain('bottom-[68px]');
    expect(footer).toContain("OWNER_ADMIN_FORM_FOOTER_NAV_GAP_PX = 8");
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain("md:max-w-[min(100%,52rem)]");
    expect(hub).not.toMatch(/max-w-lg/);
  });

  it("DRAFT delete allows owner_sponsored_*_draft audits and uses Dibay Owner confirm modal", () => {
    const writer = read("lib/stores/advertising/owner-store-sponsored-writer.ts");
    const fnStart = writer.indexOf("export async function deleteOwnerSponsoredDraft");
    expect(fnStart).toBeGreaterThan(-1);
    const body = writer.slice(fnStart, fnStart + 2500);
    expect(body).toContain("owner_sponsored_create_draft");
    expect(body).toContain("owner_sponsored_update_draft");
    expect(body).not.toMatch(/return action && !action\.startsWith\("draft_"\);/);
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain("OwnerStoreAdminConfirmModal");
    expect(hub).not.toContain("window.confirm");
    expect(hub).toContain("common_delete");
    expect(hub).toContain('confirmTone="danger"');
  });
});
