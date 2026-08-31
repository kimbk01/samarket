/**
 * R4 — Partner membership + DIBAY first-party Banner (static/source contracts).
 * R4-P1..P16 · R4-F1..F16
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES,
  DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES,
  DELIVERY_AD_PARTNER_OPEN_STATUSES,
  DELIVERY_AD_PARTNER_ORGANIC_EFFECT,
  DELIVERY_AD_PARTNER_PAYMENT,
  calculateDeliveryAdCommercialQuote,
  type DeliveryAdPackageRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  partnerMembershipGrantsAdvertisingDiscount,
} from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";
import {
  R3_ADMIN_NO_FIRST_PARTY_CREATE,
  R3_ADMIN_PARTNER_NOT_PRODUCT,
  R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED,
  R4_PARTNER_MEMBERSHIP_PRODUCT_ENABLED,
  R4_STORE_PROMOTION_FIRST_PARTY,
  adminDeliveryAdCampaignSourceHumanLabel,
  adminDeliveryAdCampaignSourceLabelKey,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { adminCreateDeliveryAdFirstPartyStoreSponsored } from "@/lib/stores/advertising/delivery-ad-admin-first-party-writer";
import { DELIVERY_AD_ADMIN_ROUTES, DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const migPending = () =>
  read("supabase/migrations/20261201250000_delivery_ads_r4_partner_membership_pending.sql");
const partnerWriter = () =>
  read("lib/stores/advertising/delivery-ad-partner-membership-writer.ts");
const fpWriter = () =>
  read("lib/stores/advertising/delivery-ad-admin-first-party-writer.ts");
const ownerHub = () => read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
const ownerPartner = () =>
  read("components/business/owner/ads/OwnerDeliveryAdPartnerView.tsx");
const adminHub = () => read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
const commercial = () =>
  read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
const ownerI18n = () => read("lib/i18n/catalog/owner-delivery-ads.ts");
const adminI18n = () => read("lib/i18n/catalog/admin-delivery-ads.ts");
const catalog = () => read("lib/stores/advertising/delivery-ad-commercial-catalog.ts");

const basePkg = (overrides: Partial<DeliveryAdPackageRow> = {}): DeliveryAdPackageRow => ({
  id: "pkg1",
  productKind: "banner",
  inventoryKey: "STORES_HOME_HERO",
  code: "7_day",
  displayName: "7 day",
  durationDays: 7,
  priceAmountMinor: 10_000,
  currency: "PHP",
  enabled: true,
  displayOrder: 1,
  ...overrides,
});

describe("R4 Partner membership", () => {
  it("R4-P1 — PENDING_REVIEW migration expands status CHECK", () => {
    expect(existsSync(join(root, "supabase/migrations/20261201250000_delivery_ads_r4_partner_membership_pending.sql"))).toBe(
      true
    );
    expect(migPending()).toContain("PENDING_REVIEW");
    expect(migPending()).toContain("delivery_ad_partner_memberships_status_check");
  });

  it("R4-P2 — membership status union includes PENDING_REVIEW", () => {
    expect([...DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES]).toEqual([
      "NONE",
      "PENDING_REVIEW",
      "ACTIVE",
      "PAST_DUE",
      "CANCEL_PENDING",
      "ENDED",
    ]);
  });

  it("R4-P3 — Owner apply writer creates PENDING_REVIEW only", () => {
    expect(partnerWriter()).toContain("ownerApplyPartnerMembership");
    expect(partnerWriter()).toContain('status: "PENDING_REVIEW"');
    expect(partnerWriter()).toContain("NOT_IMPLEMENTED");
  });

  it("R4-P4 — Admin approve snapshots fee/discount/benefits/config_version", () => {
    expect(partnerWriter()).toContain("adminApprovePartnerMembership");
    expect(partnerWriter()).toContain("fee_snapshot_minor");
    expect(partnerWriter()).toContain("advertising_discount_percent_snapshot");
    expect(partnerWriter()).toContain("benefit_snapshot");
    expect(partnerWriter()).toContain("config_version_snapshot");
  });

  it("R4-P5 — Owner cancel request ACTIVE → CANCEL_PENDING", () => {
    expect(partnerWriter()).toContain("ownerRequestPartnerMembershipCancel");
    expect(partnerWriter()).toContain('status: "CANCEL_PENDING"');
  });

  it("R4-P6 — Admin end → ENDED", () => {
    expect(partnerWriter()).toContain("adminEndPartnerMembership");
    expect(partnerWriter()).toContain('status: "ENDED"');
  });

  it("R4-P7 — PENDING_REVIEW never gets advertising discount", () => {
    expect(partnerMembershipGrantsAdvertisingDiscount("PENDING_REVIEW")).toBe(false);
    expect(partnerMembershipGrantsAdvertisingDiscount("ACTIVE")).toBe(true);
    expect(partnerMembershipGrantsAdvertisingDiscount("CANCEL_PENDING")).toBe(true);
    expect([...DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES]).toEqual([
      "ACTIVE",
      "CANCEL_PENDING",
    ]);
    expect(catalog()).toContain('.in("status", ["ACTIVE", "CANCEL_PENDING"])');
    expect(catalog()).toContain("PENDING_REVIEW must never discount");
  });

  it("R4-P8 — quote path ignores inactive / pending partner", () => {
    const qPending = calculateDeliveryAdCommercialQuote({
      productKind: "banner",
      inventoryKey: "STORES_HOME_HERO",
      package: basePkg(),
      placement: {
        productKind: "banner",
        inventoryKey: "STORES_HOME_HERO",
        sellable: true,
      },
      productEnabled: true,
      acceptingApplications: true,
      partner: {
        membershipId: "m-pending",
        active: false,
        advertisingDiscountPercent: 20,
        benefitSnapshot: {},
        status: "PENDING_REVIEW",
      },
    });
    expect(qPending.ok).toBe(true);
    if (qPending.ok) {
      expect(qPending.partnerDiscountPercent).toBe(0);
      expect(qPending.finalPayableMinor).toBe(10_000);
    }
  });

  it("R4-P9 — Partner PAYMENT is NOT_IMPLEMENTED (no Business Cash fake)", () => {
    expect(DELIVERY_AD_PARTNER_PAYMENT.status).toBe("NOT_IMPLEMENTED");
    expect(DELIVERY_AD_PARTNER_PAYMENT.businessCashCharge).toBe(false);
    expect(partnerWriter()).toContain("payment: \"NOT_IMPLEMENTED\"");
    expect(ownerPartner()).toContain('data-partner-payment="NOT_IMPLEMENTED"');
  });

  it("R4-P10 — Partner organic effect remains locked off", () => {
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.organicRankingBoost).toBe(false);
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.organicInjection).toBe(false);
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.bypassSponsoredLabel).toBe(false);
  });

  it("R4-P11 — Owner hub Partner card + route", () => {
    expect(DELIVERY_AD_OWNER_ROUTES.partner).toBe("/stores/owner/ads/partner");
    expect(ownerHub()).toContain("data-owner-ads-partner-card");
    expect(ownerHub()).toContain("DELIVERY_AD_OWNER_ROUTES.partner");
    expect(existsSync(join(root, "app/(main)/stores/owner/ads/partner/page.tsx"))).toBe(true);
  });

  it("R4-P12 — Owner partner API route", () => {
    expect(
      existsSync(join(root, "app/api/me/delivery-ads/partner/route.ts"))
    ).toBe(true);
    const api = read("app/api/me/delivery-ads/partner/route.ts");
    expect(api).toContain("ownerApplyPartnerMembership");
    expect(api).toContain("cancel_request");
  });

  it("R4-P13 — Admin membership API + panel", () => {
    expect(
      existsSync(join(root, "app/api/admin/delivery-ads/partner/memberships/route.ts"))
    ).toBe(true);
    expect(DELIVERY_AD_ADMIN_ROUTES.partnerMemberships).toBe("/admin/delivery-ads/partner");
    expect(
      existsSync(join(root, "components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx"))
    ).toBe(true);
  });

  it("R4-P14 — Admin commercial Partner SSOT links to unified partner page", () => {
    expect(commercial()).toContain('data-commercial-partner="r4-link"');
    expect(commercial()).toContain("DELIVERY_AD_ADMIN_ROUTES.partnerMemberships");
    expect(commercial()).not.toContain("data-commercial-partner-collapsed");
    expect(R4_PARTNER_MEMBERSHIP_PRODUCT_ENABLED).toBe(true);
    expect(R3_ADMIN_PARTNER_NOT_PRODUCT).toBe(true);
  });

  it("R4-P15 — open statuses block duplicate apply", () => {
    expect([...DELIVERY_AD_PARTNER_OPEN_STATUSES]).toContain("PENDING_REVIEW");
    expect([...DELIVERY_AD_PARTNER_OPEN_STATUSES]).toContain("ACTIVE");
    expect(partnerWriter()).toContain("already_open");
  });

  it("R4-P16 — Partner i18n ko+en keys present; no hardcoded fee literals in Owner partner UI", () => {
    expect(ownerI18n()).toContain("owner_ads_partner_apply_cta");
    expect(ownerI18n()).toContain("Apply");
    expect(adminI18n()).toContain("admin_delivery_ads_partner_approve");
    expect(ownerPartner()).not.toMatch(/\b199\b|\b349\b|\b599\b/);
    expect(ownerPartner()).toContain("monthlyFeeLabel");
  });
});

describe("R4 DIBAY first-party Banner", () => {
  it("R4-F1 — first-party create enabled; R3 lock flipped", () => {
    expect(R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED).toBe(true);
    expect(R3_ADMIN_NO_FIRST_PARTY_CREATE).toBe(false);
  });

  it("R4-F2 — writer persists DIBAY_FIRST_PARTY with null owner", () => {
    expect(fpWriter()).toContain("adminCreateDeliveryAdFirstPartyBanner");
    expect(fpWriter()).toContain('campaign_source: "DIBAY_FIRST_PARTY"');
    expect(fpWriter()).toContain("owner_user_id: null");
  });

  it("R4-F3 — no fake Owner for first-party", () => {
    expect(fpWriter()).toContain("owner_user_id: null");
    expect(fpWriter()).not.toMatch(/fakeOwner|owner_user_id:\s*["'][^"']+["']/);
    expect(fpWriter()).toMatch(/owner_user_id:\s*null/);
  });

  it("R4-F4 — Store Promotion first-party MODEL_BLOCKED", () => {
    expect(R4_STORE_PROMOTION_FIRST_PARTY.status).toBe("NOT_IMPLEMENTED_MODEL_BLOCKED");
    expect(adminCreateDeliveryAdFirstPartyStoreSponsored().ok).toBe(false);
    expect(adminCreateDeliveryAdFirstPartyStoreSponsored().status).toBe(
      "NOT_IMPLEMENTED_MODEL_BLOCKED"
    );
    expect(fpWriter()).toContain("NOT_IMPLEMENTED_MODEL_BLOCKED");
  });

  it("R4-F5 — Admin first-party API route", () => {
    expect(existsSync(join(root, "app/api/admin/delivery-ads/first-party/route.ts"))).toBe(true);
    const api = read("app/api/admin/delivery-ads/first-party/route.ts");
    expect(api).toContain("adminCreateDeliveryAdFirstPartyBanner");
    expect(api).toContain("store_sponsored");
  });

  it("R4-F6 — Hub CTA 디바이 광고 만들기", () => {
    expect(adminHub()).toContain("data-admin-delivery-ads-first-party-cta");
    expect(adminHub()).toContain("DELIVERY_AD_ADMIN_ROUTES.firstPartyNew");
    expect(DELIVERY_AD_ADMIN_ROUTES.firstPartyNew).toBe("/admin/delivery-ads/first-party/new");
  });

  it("R4-F7 — create workspace page uses DeliveryAdBanner preview", () => {
    expect(
      existsSync(join(root, "app/admin/delivery-ads/first-party/new/page.tsx"))
    ).toBe(true);
    const view = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(view).toContain("DeliveryAdBanner");
    expect(view).toContain('data-admin-first-party-create="design-board"');
    expect(view).toContain('data-admin-first-party-wizard="step-gated"');
    expect(view).toContain("NOT_IMPLEMENTED_MODEL_BLOCKED");
  });

  it("R4-F8 — SOURCE human labels 광고주 / 디바이", () => {
    expect(adminDeliveryAdCampaignSourceHumanLabel("OWNER_PAID", "ko")).toBe("광고주 광고");
    expect(adminDeliveryAdCampaignSourceHumanLabel("DIBAY_FIRST_PARTY", "ko")).toBe(
      "디바이 광고"
    );
    expect(adminDeliveryAdCampaignSourceLabelKey("DIBAY_FIRST_PARTY")).toBe(
      "admin_delivery_ads_source_dibay_first_party"
    );
    expect(adminHub()).toContain("adminDeliveryAdCampaignSourceLabelKey");
    expect(adminI18n()).toContain("admin_delivery_ads_source_owner_paid");
    expect(adminI18n()).toContain("admin_delivery_ads_source_dibay_first_party");
  });

  it("R4-F9 — loader selects campaign_source", () => {
    const loader = read("lib/stores/advertising/admin-delivery-ad-loader.ts");
    expect(loader).toContain("campaign_source");
    expect(loader).toContain("campaignSource");
  });

  it("R4-F10 — first-party quote is FIRST_PARTY_NO_CHARGE", () => {
    const q = calculateDeliveryAdCommercialQuote({
      productKind: "banner",
      inventoryKey: "STORES_HOME_HERO",
      package: basePkg({ priceAmountMinor: null }),
      placement: null,
      productEnabled: true,
      acceptingApplications: true,
      partner: {
        membershipId: null,
        active: false,
        advertisingDiscountPercent: 0,
        benefitSnapshot: {},
      },
      campaignSource: "DIBAY_FIRST_PARTY",
    });
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.commercialStatus).toBe("FIRST_PARTY_NO_CHARGE");
      expect(q.finalPayableMinor).toBe(0);
      expect(q.campaignSource).toBe("DIBAY_FIRST_PARTY");
    }
  });

  it("R4-F11 — placements HOME_HERO / SEARCH_TOP only in create UI", () => {
    const view = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(view).toContain("OWNER_BANNER_INVENTORY_KEYS");
    expect(view).toContain("STORES_HOME_HERO");
  });

  it("R4-F12 — commercial snapshot insert on create", () => {
    expect(fpWriter()).toContain("insertCampaignCommercialSnapshot");
    expect(fpWriter()).toContain("FIRST_PARTY_NO_CHARGE");
  });

  it("R4-F13 — uses existing upload path", () => {
    const view = read("components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx");
    expect(view).toContain("/api/admin/delivery-ads/upload-banner-image");
  });

  it("R4-F14 — i18n keys for first-party present ko+en", () => {
    expect(adminI18n()).toContain("admin_delivery_ads_first_party_cta");
    expect(adminI18n()).toContain("Create DIBAY ad");
    expect(adminI18n()).toContain("디바이 광고 만들기");
  });

  it("R4-F15 — package price / organic resolvers untouched by R4 writers", () => {
    expect(fpWriter()).not.toContain("adminUpdateDeliveryAdPackagePrice");
    expect(partnerWriter()).not.toContain("organic");
    expect(fpWriter()).not.toMatch(/discovery.?rank|organicRanking/i);
  });

  it("R4-F16 — re-export blocked store-sponsored helper documented", () => {
    expect(R4_STORE_PROMOTION_FIRST_PARTY.reason).toMatch(/store-bound|Banner first-party/i);
  });
});
