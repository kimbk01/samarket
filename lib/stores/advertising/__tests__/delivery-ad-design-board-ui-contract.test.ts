/**
 * Design board UI contract — each view must wire attached spec markers.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_DESIGN_BOARD,
  DELIVERY_AD_OWNER_APPLICATION_SECTIONS,
  DELIVERY_AD_OWNER_HUB_CONTRACT,
  DELIVERY_AD_ADMIN_HUB_CONTRACT,
  DELIVERY_AD_CUSTOMER_AD_TAG_CLASS,
} from "@/lib/stores/advertising/delivery-ad-design-board-contract";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Delivery Ads design board UI contract", () => {
  it("DB-O1 — primary brand color #0A823E", () => {
    expect(DELIVERY_AD_DESIGN_BOARD.colorPrimary).toBe("#0A823E");
  });

  it("DB-O2 — owner hub wires greeting, CTA, recent ads, partner-after-list", () => {
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain(DELIVERY_AD_OWNER_HUB_CONTRACT.primaryCtaKey);
    expect(hub).toContain(DELIVERY_AD_OWNER_HUB_CONTRACT.recentAdsTitleKey);
    expect(hub).toContain("data-owner-ads-hub-greeting");
    expect(hub).toContain("data-owner-ads-partner-card");
    expect(hub).toContain("grid-cols-5");
    expect(hub).toContain("data-owner-ads-hub-card-title");
    expect(hub.indexOf("data-owner-ads-recent-title")).toBeLessThan(
      hub.indexOf("data-owner-ads-partner-card")
    );
    // safeTranslate rejects unreplaced {name} — must pass vars, not .replace after t()
    expect(hub).toContain('t("owner_ads_hub_greeting", { name: ownerDisplayName })');
    expect(hub).not.toContain('t("owner_ads_hub_greeting").replace');
  });

  it("DB-O3 — application workspace is single-page with confirm", () => {
    const create = read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx");
    expect(create).toContain('data-owner-ads-wizard="single-page"');
    expect(create).not.toContain("OwnerDeliveryAdApplicationWizardShell");
    expect(create).toContain("DeliveryAdOwnerApplicationConfirm");
    expect(create).toContain("DeliveryAdOwnerInsufficientCashSubmitModal");
    for (const s of ["store", "placement", "packages", "preview", "confirm"]) {
      expect(
        DELIVERY_AD_OWNER_APPLICATION_SECTIONS.some((x) => x.id === s)
      ).toBe(true);
    }
  });

  it("DB-O4 — package grid 3-column + placement visual grid", () => {
    expect(read("components/stores/advertising/DeliveryAdOwnerPackageCardGrid.tsx")).toContain(
      "grid-cols-3"
    );
    expect(read("components/stores/advertising/DeliveryAdOwnerPlacementVisualGrid.tsx")).toContain(
      'data-owner-ads-placement-grid="visual-launch"'
    );
    expect(read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx")).toContain(
      "DeliveryAdOwnerPlacementVisualGrid"
    );
  });

  it("DB-O5 — preview uses phone frame chrome + tabs + compare", () => {
    expect(read("components/stores/advertising/DeliveryAdOwnerPreviewWorkspace.tsx")).toContain(
      "data-owner-ads-preview-workspace"
    );
    expect(read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx")).toContain(
      "DeliveryAdOwnerPreviewWorkspace"
    );
  });

  it("DB-O9 — confirm timeline + business cash note + package daily avg", () => {
    const confirm = read("components/stores/advertising/DeliveryAdOwnerApplicationConfirm.tsx");
    expect(confirm).toContain("data-owner-ads-confirm-timeline");
    const i18n = read("lib/i18n/catalog/owner-delivery-ads.ts");
    expect(i18n).toContain("owner_ads_confirm_timeline_review");
    expect(i18n).toContain("owner_ads_package_daily_avg");
    expect(read("components/stores/advertising/DeliveryAdOwnerPackageCardGrid.tsx")).toContain(
      "owner_ads_package_daily_avg"
    );
  });

  it("DB-O10 — product select cards with icons", () => {
    expect(read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx")).toContain(
      "DeliveryAdOwnerProductSelectCard"
    );
  });

  it("DB-O6 — i18n section titles match board (ko)", () => {
    const i18n = read("lib/i18n/catalog/owner-delivery-ads.ts");
    expect(i18n).toContain('owner_ads_section_packages: "광고 기간 선택"');
    expect(i18n).toContain('owner_ads_section_confirm: "신청 확인"');
    expect(i18n).toContain('owner_ads_apply_primary_cta: "+ 새 광고 신청하기"');
  });

  it("DB-O7 — banner application is single-page workspace with creative A/B", () => {
    const banner = read("components/business/owner/ads/OwnerBannerCreateView.tsx");
    expect(banner).toContain('data-owner-ads-wizard="single-page"');
    expect(banner).toContain('data-owner-ads-creative-mode="choice"');
    expect(banner).toContain("DeliveryAdOwnerPlacementVisualGrid");
    expect(banner).toContain("DeliveryAdOwnerPreviewWorkspace");
    expect(banner).toContain("DeliveryAdOwnerApplicationConfirm");
    expect(banner).not.toContain("OwnerDeliveryAdApplicationWizardShell");
  });

  it("DB-O8 — owner partner view 4-step progress + benefits", () => {
    const partner = read("components/business/owner/ads/OwnerDeliveryAdPartnerView.tsx");
    expect(partner).toContain("DeliveryAdOwnerPartnerStepProgress");
    expect(partner).toContain('data-owner-ads-partner="design-board"');
    expect(partner).toContain("data-owner-ads-partner-benefits");
  });

  it("DB-A1 — admin hub today summary + action queue design board", () => {
    expect(DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryBuckets).toHaveLength(8);
    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).toContain("DeliveryAdAdminTodaySummary");
    expect(hub).toContain('data-admin-delivery-ads-hub="design-board"');
    expect(hub).toContain("aggregateAdminHubTodayCounts");
    const today = read("components/stores/advertising/DeliveryAdAdminTodaySummary.tsx");
    expect(today).toContain("DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryKey");
    expect(today).toContain('data-admin-delivery-ads-today-summary="design-board"');
    const queue = read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
    expect(queue).toContain('data-admin-delivery-ads-action-queue="design-board"');
    expect(queue).toContain("data-admin-delivery-ads-action-queue-table");
    expect(queue).toContain("data-queue-commercial-summary");
  });

  it("DB-A4 — admin partner table + first-party single-page", () => {
    const partner = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
    expect(partner).toContain("data-admin-partner-memberships-table");
    expect(partner).toContain("AdminDeliveryAdPartnerConfigForm");
    const firstParty = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(firstParty).toContain('data-admin-first-party-wizard="single-page"');
    expect(firstParty).toContain("data-admin-fp-pixel-guide");
    expect(firstParty).toContain("bannerGeometryRejectMessage");
    expect(firstParty).not.toContain("DeliveryAdAdminFirstPartyStepProgress");
  });

  it("DB-A3b — standalone banner creative studio route", () => {
    expect(read("lib/stores/advertising/delivery-ad-routes.ts")).toContain("creative:");
    expect(read("app/admin/delivery-ads/[campaignId]/creative/page.tsx")).toContain(
      "AdminDeliveryAdBannerStudioView"
    );
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("data-admin-delivery-ads-creative-studio-link");
    const queue = read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
    expect(queue).toContain("DELIVERY_AD_ADMIN_ROUTES.creative");
  });

  it("DB-A2 — admin detail split summary + phone preview", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain('data-admin-delivery-ads-detail-split="design-board"');
    expect(detail).toContain("DeliveryAdOwnerPhoneFrame");
    expect(detail).toContain('data-admin-delivery-ads-detail="design-board"');
  });

  it("DB-A3 — admin commercial price matrix design board", () => {
    const commercial = read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
    expect(commercial).toContain('data-admin-delivery-ads-commercial="design-board"');
    expect(commercial).toContain('data-commercial-matrix-table="design-board"');
  });

  it("DB-C1 — customer ad tag #FF8A00 on store cards + banner", () => {
    expect(DELIVERY_AD_CUSTOMER_AD_TAG_CLASS).toContain("#FF8A00");
    expect(read("components/stores/advertising/DeliveryAdCustomerAdTag.tsx")).toContain(
      "data-delivery-ad-customer-tag"
    );
    expect(read("components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx")).toContain(
      "DeliveryAdCustomerAdTag"
    );
    expect(read("components/stores/home/presentation/StoresHomeStoreTeaserCard.tsx")).toContain(
      "DeliveryAdCustomerAdTag"
    );
    expect(read("components/stores/home/presentation/StoresHomeBrandCircularCard.tsx")).toContain(
      "DeliveryAdCustomerAdTag"
    );
    expect(read("components/stores/advertising/DeliveryAdBanner.tsx")).toContain(
      "DELIVERY_AD_CUSTOMER_AD_TAG_CLASS"
    );
  });
});
