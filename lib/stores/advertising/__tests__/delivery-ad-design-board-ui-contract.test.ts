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
  });

  it("DB-O3 — application workspace has 4-step progress + confirm section", () => {
    const create = read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx");
    const shell = read("components/business/owner/ads/OwnerDeliveryAdApplicationWizardShell.tsx");
    expect(create).toContain("OwnerDeliveryAdApplicationWizardShell");
    expect(shell).toContain("DeliveryAdOwnerStepProgress");
    expect(shell).toContain('data-owner-ads-wizard="step-gated"');
    expect(create).toContain("DeliveryAdOwnerApplicationConfirm");
    expect(create).toContain('data-owner-ads-step-panel="4"');
    for (const s of ["store", "placement", "packages", "preview", "confirm"]) {
      expect(
        DELIVERY_AD_OWNER_APPLICATION_SECTIONS.some((x) => x.id === s)
      ).toBe(true);
    }
  });

  it("DB-O4 — package grid 3-column + placement chip grid", () => {
    expect(read("components/stores/advertising/DeliveryAdOwnerPackageCardGrid.tsx")).toContain(
      "grid-cols-3"
    );
    expect(read("components/stores/advertising/DeliveryAdOwnerPlacementChipGrid.tsx")).toContain(
      "data-owner-ads-placement-grid"
    );
    expect(read("components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx")).toContain(
      "DeliveryAdOwnerPlacementChipGrid"
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
    expect(i18n).toContain('owner_ads_section_packages: "기간/패키지/가격 선택"');
    expect(i18n).toContain('owner_ads_section_confirm: "신청 확인"');
    expect(i18n).toContain('owner_ads_apply_primary_cta: "+ 새 광고 신청하기"');
  });

  it("DB-O7 — banner application mirrors store sponsored step-gated wizard", () => {
    const banner = read("components/business/owner/ads/OwnerBannerCreateView.tsx");
    expect(banner).toContain("OwnerDeliveryAdApplicationWizardShell");
    expect(banner).toContain('data-owner-ads-wizard="step-gated"');
    expect(banner).toContain("DeliveryAdOwnerPlacementChipGrid");
    expect(banner).toContain("DeliveryAdOwnerPreviewWorkspace");
    expect(banner).toContain("DeliveryAdOwnerApplicationConfirm");
  });

  it("DB-O8 — owner partner view 4-step progress + benefits", () => {
    const partner = read("components/business/owner/ads/OwnerDeliveryAdPartnerView.tsx");
    expect(partner).toContain("DeliveryAdOwnerPartnerStepProgress");
    expect(partner).toContain('data-owner-ads-partner="design-board"');
    expect(partner).toContain("data-owner-ads-partner-benefits");
  });

  it("DB-A1 — admin hub today summary + action queue design board", () => {
    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).toContain("DeliveryAdAdminTodaySummary");
    expect(hub).toContain('data-admin-delivery-ads-hub="design-board"');
    const today = read("components/stores/advertising/DeliveryAdAdminTodaySummary.tsx");
    expect(today).toContain("DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryKey");
    expect(today).toContain('data-admin-delivery-ads-today-summary="design-board"');
    const queue = read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
    expect(queue).toContain('data-admin-delivery-ads-action-queue="design-board"');
    expect(queue).toContain("data-admin-delivery-ads-action-queue-table");
  });

  it("DB-A4 — admin partner table + first-party 4-step", () => {
    expect(read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx")).toContain(
      "data-admin-partner-memberships-table"
    );
    expect(read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx")).toContain(
      "DeliveryAdAdminFirstPartyStepProgress"
    );
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
    expect(read("components/stores/advertising/DeliveryAdBanner.tsx")).toContain(
      "DELIVERY_AD_CUSTOMER_AD_TAG_CLASS"
    );
  });
});
