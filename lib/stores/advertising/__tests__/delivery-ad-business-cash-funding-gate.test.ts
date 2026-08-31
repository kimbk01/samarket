/**
 * Business Cash funding gate P1 — targeted money + go-live contract tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_BUSINESS_CASH_PLATFORM,
  DELIVERY_AD_FUNDING_MODEL,
  assertBusinessCashMoneyMinor,
  buildOwnerFundIdempotencyKey,
  isDeliveryAdFundingReadyForGoLive,
  resolveDeliveryAdFundingStatus,
} from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { evaluateStoreSponsoredCampaignGates } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import { evaluateDeliveryBannerPublishReadiness } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";

const MIG = resolve(
  process.cwd(),
  "supabase/migrations/20261201197000_delivery_ads_business_cash_funding_gate.sql"
);
const OWNER_UI = resolve(
  process.cwd(),
  "components/business/owner/ads/OwnerDeliveryAdsHubView.tsx"
);
const OWNER_DETAIL = resolve(
  process.cwd(),
  "components/business/owner/ads/OwnerDeliveryAdDetailView.tsx"
);

function mig(): string {
  return readFileSync(MIG, "utf8");
}

describe("Business Cash funding gate P1", () => {
  it("T1/T17 — ledger append-only; no boolean funded mark without ledger", () => {
    const sql = mig();
    expect(sql).toContain("delivery_ad_business_cash_ledger");
    expect(sql).toContain("delivery_ad_business_cash_ledger_forbid_mutate");
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
    expect(sql).not.toMatch(/funding_status\s*=\s*'FUNDED'\s*[^;]*without/i);
    expect(sql).toContain("ledger_transaction_id uuid NOT NULL");
  });

  it("T5/T6 — amount from immutable snapshot final_payable_minor", () => {
    const sql = mig();
    expect(sql).toContain("v_amount := v_snap.final_payable_minor");
    expect(sql).toContain("commercial_status IS DISTINCT FROM 'PRICED'");
    expect(sql).not.toContain("base_price_minor_snapshot AS payable");
  });

  it("T7 — currency mismatch rejected", () => {
    expect(mig()).toContain("currency_mismatch");
  });

  it("T8 — insufficient balance rejected", () => {
    expect(mig()).toContain("insufficient_balance");
  });

  it("T9/T10/T12 — exactly-once idempotency + already funded", () => {
    const sql = mig();
    expect(sql).toContain("UNIQUE (idempotency_key)");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(sql).toContain("idempotent");
    expect(sql).toContain("funding_status = 'FUNDED'");
  });

  it("T11 — account row locked FOR UPDATE before debit", () => {
    const sql = mig();
    expect(sql).toContain("delivery_ad_business_cash_ensure_account");
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it("T13 — funding links campaign + snapshot", () => {
    const sql = mig();
    expect(sql).toContain("commercial_snapshot_id uuid NOT NULL");
    expect(sql).toContain("delivery_ad_campaign_fundings_campaign_uidx");
  });

  it("T14/T15/T16 — refund references debit, duplicate blocked, exact amount", () => {
    const sql = mig();
    expect(sql).toContain("admin_refund_delivery_ad_campaign_funding");
    expect(sql).toContain("related_ledger_id");
    expect(sql).toContain("already_refunded");
    expect(sql).toContain("v_new_balance := v_acc.balance_minor + v_funding.amount_minor");
  });

  it("T2/T3/T4 — owner own-campaign auth; cross-owner/anon denied at SQL grants", () => {
    const sql = mig();
    expect(sql).toContain("owner_user_id IS DISTINCT FROM p_owner_user_id");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.owner_fund_delivery_ad_campaign"
    );
    expect(sql).toContain("FROM anon, authenticated");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.owner_fund_delivery_ad_campaign"
    );
    expect(sql).toContain("TO service_role");
  });

  it("T18/T27 — DIBAY_FIRST_PARTY funding exempt", () => {
    expect(isDeliveryAdFundingReadyForGoLive({
      campaignSource: "DIBAY_FIRST_PARTY",
      fundingStatus: "UNFUNDED",
    })).toBe(true);
    expect(mig()).toContain("first_party_no_funding");
    expect(mig()).toContain("DIBAY_FIRST_PARTY");
  });

  it("MODEL B lock + platform flags", () => {
    expect(DELIVERY_AD_FUNDING_MODEL.id).toBe("MODEL_B_ACTIVATION_GATE");
    expect(DELIVERY_AD_BUSINESS_CASH_PLATFORM.externalTopUp).toBe(
      "NOT_IMPLEMENTED_PRESERVED"
    );
    expect(DELIVERY_AD_BUSINESS_CASH_PLATFORM.cutHBilling).toBe("PRESERVED_DISABLED");
  });

  it("T19/T21 — unfunded OWNER_PAID cannot ACTIVE (admin + schedule RPCs)", () => {
    const sql = mig();
    expect(sql).toContain("funding_required");
    expect(sql).toContain("delivery_ad_campaign_funding_allows_active");
    expect(sql).toMatch(/IF v_to = 'ACTIVE' AND NOT public\.delivery_ad_campaign_funding_allows_active/);
    expect(sql).toMatch(/p_action = 'activate_due'[\s\S]*funding_required/);
  });

  it("T20/T22 — funded readiness SSOT", () => {
    expect(
      isDeliveryAdFundingReadyForGoLive({
        campaignSource: "OWNER_PAID",
        fundingStatus: "FUNDED",
      })
    ).toBe(true);
    expect(
      isDeliveryAdFundingReadyForGoLive({
        campaignSource: "OWNER_PAID",
        fundingStatus: "UNFUNDED",
      })
    ).toBe(false);
  });

  it("T23 — customer Store Promotion rejects unfunded", () => {
    const gates = evaluateStoreSponsoredCampaignGates({
      campaign: {
        id: "c1",
        storeId: "s1",
        placement: "stores_home",
        title: "t",
        headline: "h",
        bodyCopy: null,
        imageUrl: null,
        startAt: "2020-01-01T00:00:00.000Z",
        endAt: "2099-01-01T00:00:00.000Z",
        isActive: true,
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        inventoryKeys: ["STORES_HOME_FEED"],
        campaignSource: "OWNER_PAID",
        fundingStatus: "UNFUNDED",
      },
      surface: "STORES_HOME_FEED",
      nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    expect(gates.ok).toBe(false);
    expect(gates.reasons).toContain("funding_ready");
  });

  it("T24 — customer Banner rejects unfunded", () => {
    const gate = evaluateBannerHomeHeroExposure({
      campaign: {
        id: "b1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        startAt: "2020-01-01T00:00:00.000Z",
        endAt: "2099-01-01T00:00:00.000Z",
        inventoryKeys: ["STORES_HOME_HERO"],
        creativeAssetPath: "delivery-ads/ready.png",
        creativeReviewStatus: "APPROVED",
        ctaHref: "/stores/s1",
        storeId: "s1",
        campaignSource: "OWNER_PAID",
        fundingStatus: "UNFUNDED",
      },
      nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain("funding_ready");
  });

  it("T25 — funded Banner still requires creative/destination", () => {
    const readiness = evaluateDeliveryBannerPublishReadiness({
      creativeAssetPath: "delivery-ads/pending/admin-production",
      ctaHref: "",
    });
    expect(readiness.ok).toBe(false);
    const gate = evaluateBannerHomeHeroExposure({
      campaign: {
        id: "b1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        startAt: "2020-01-01T00:00:00.000Z",
        endAt: "2099-01-01T00:00:00.000Z",
        inventoryKeys: ["STORES_HOME_HERO"],
        creativeAssetPath: "delivery-ads/pending/admin-production",
        creativeReviewStatus: "APPROVED",
        ctaHref: "",
        storeId: "s1",
        campaignSource: "OWNER_PAID",
        fundingStatus: "FUNDED",
      },
      nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("creative") || r.includes("destination"))).toBe(
      true
    );
  });

  it("T26 — funded Store Promotion needs no Banner creative", () => {
    const gates = evaluateStoreSponsoredCampaignGates({
      campaign: {
        id: "c1",
        storeId: "s1",
        placement: "stores_home",
        title: "t",
        headline: "h",
        bodyCopy: null,
        imageUrl: null,
        startAt: "2020-01-01T00:00:00.000Z",
        endAt: "2099-01-01T00:00:00.000Z",
        isActive: true,
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        inventoryKeys: ["STORES_HOME_FEED"],
        campaignSource: "OWNER_PAID",
        fundingStatus: "FUNDED",
      },
      surface: "STORES_HOME_FEED",
      nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    expect(gates.ok).toBe(true);
    expect(gates.reasons).not.toContain("creative");
  });

  it("T28/T29 — pause/resume/end do not debit or auto-refund in schedule/admin paths", () => {
    const sql = mig();
    expect(sql).not.toMatch(/p_action = 'pause'[\s\S]{0,200}AD_FUNDING_DEBIT/);
    expect(sql).not.toMatch(/p_action = 'end'[\s\S]{0,200}AD_REFUND/);
    expect(sql).not.toMatch(/system_ended[\s\S]{0,120}AD_REFUND/);
  });

  it("T30 — HOME paid insertion default remains OFF", () => {
    expect(
      STORES_HOME_COMPOSITION_DEFAULT_POLICY.find((r) => r.slot === "homePaidAdInsertion")
        ?.enabled
    ).toBe(false);
  });

  it("T31–T36 — Owner funding UI contract (Store Cash authority, no legacy pay CTA)", () => {
    const hub = readFileSync(OWNER_UI, "utf8");
    const detail = readFileSync(OWNER_DETAIL, "utf8");
    expect(hub).toContain('data-owner-ads-business-cash="card"');
    expect(hub).not.toContain('data-owner-ads-business-cash="stub"');
    expect(hub).not.toMatch(/text-\[3[2-9]px\].*Business Cash|hero.*Business Cash/i);
    expect(hub).not.toContain("owner_ads_business_cash_topup_unavailable");
    expect(detail).toContain('data-owner-ads-detail-section="funding"');
    expect(detail).toContain("ownerAdsShouldShowFundingPanel");
    // Stage 1 DEBIT_REFUND at submit — legacy post-approval Business Cash pay CTA removed.
    expect(detail).not.toContain("owner_ads_funding_pay_cta");
    expect(detail).not.toContain("data-owner-ads-fund-cta");
    expect(detail).toContain("data-owner-ads-fund-store-cash");
  });

  it("money minor helpers + idempotency key", () => {
    expect(assertBusinessCashMoneyMinor(100)).toBe(true);
    expect(assertBusinessCashMoneyMinor(0)).toBe(false);
    expect(assertBusinessCashMoneyMinor(1.5)).toBe(false);
    expect(
      buildOwnerFundIdempotencyKey({
        ownerUserId: "o1",
        productKind: "banner",
        campaignId: "c1",
      })
    ).toBe("fund:o1:banner:c1");
    expect(resolveDeliveryAdFundingStatus({ rowStatus: null })).toBe("UNFUNDED");
  });

  it("migration version sits between 196000 and CUT3 200000", () => {
    expect(MIG).toContain("20261201197000");
    const sql = mig();
    expect(sql).not.toContain("20261201200000");
    expect(sql).not.toContain("cut3");
  });
});
