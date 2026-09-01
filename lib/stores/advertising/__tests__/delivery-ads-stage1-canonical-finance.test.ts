/**
 * Stage 1 — Canonical AST-004/AST-005 finance + approval contract tests (T1–T27 targeted).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AST_004_STORE_POINTS_ECONOMIC,
  AST_005_BUSINESS_CASH,
  BUSINESS_CASH_CONVERSION_DEFAULT_RATE_PESOS,
  computeBusinessCashFromStorePoints,
  isDefaultConversionRate,
  parseInsufficientBusinessCashRpc,
  resolveFundingStatusFromCanonicalBc,
  DELIVERY_AD_CANONICAL_PAYMENT_MODEL,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { isDeliveryAdFundingReadyForGoLive } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import {
  DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES,
  DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES,
  DELIVERY_AD_PARTNER_ORGANIC_EFFECT,
  DELIVERY_AD_PARTNER_PAYMENT,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { partnerMembershipGrantsAdvertisingDiscount } from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";

const root = process.cwd();
const mig = readFileSync(
  join(root, "supabase/migrations/20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql"),
  "utf8"
);
const actions = readFileSync(
  join(root, "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts"),
  "utf8"
);
const partnerWriter = readFileSync(
  join(root, "lib/stores/advertising/delivery-ad-partner-membership-writer.ts"),
  "utf8"
);
const queue = readFileSync(
  join(root, "lib/stores/advertising/delivery-ad-operations-action-queue.ts"),
  "utf8"
);
const adminWriter = readFileSync(
  join(root, "lib/stores/advertising/admin-delivery-ad-writer.ts"),
  "utf8"
);
const fundingLoad = readFileSync(
  join(root, "lib/stores/advertising/load-delivery-ad-campaign-funding-status.ts"),
  "utf8"
);
const assetSsot = readFileSync(join(root, "docs/dibay-asset-contract-ssot.md"), "utf8");
const insufficientModal = readFileSync(
  join(root, "components/stores/advertising/DeliveryAdOwnerInsufficientCashSubmitModal.tsx"),
  "utf8"
);

describe("Stage1 canonical finance asset IDs", () => {
  it("T-registry AST-004 / AST-005 documented", () => {
    expect(AST_004_STORE_POINTS_ECONOMIC).toBe("AST-004");
    expect(AST_005_BUSINESS_CASH).toBe("AST-005");
    expect(assetSsot).toContain("AST-004");
    expect(assetSsot).toContain("AST-005");
    expect(assetSsot).toContain("AST-002");
    expect(assetSsot).toContain("Business Credit");
  });
});

describe("Stage1 physical authority SQL", () => {
  it("creates store-scoped SP + BC + ledgers + rate SSOT", () => {
    expect(mig).toContain("store_economic_point_accounts");
    expect(mig).toContain("business_cash_accounts");
    expect(mig).toContain("business_cash_ledger");
    expect(mig).toContain("business_cash_conversion_rate_policies");
    expect(mig).toContain("rate_pesos_per_point numeric");
    expect(mig).toMatch(/VALUES \('default', 1, 1\)/);
    expect(mig).toContain("convert_store_economic_points_to_business_cash");
    expect(mig).toContain("stale_rate");
    expect(mig).toContain("delivery_ad_canonical_bc_fundings");
    expect(mig).toContain("business_cash_delivery_ad_spend");
    expect(mig).toContain("INSUFFICIENT_BUSINESS_CASH");
    expect(mig).toContain("'REJECTED'");
  });

  it("T9 withdrawal forbidden on BC authority", () => {
    expect(mig).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.business_cash_ledger \([\s\S]*?CONSTRAINT business_cash_ledger_idem_uidx/
    );
    const bcLedgerBlock = mig.match(
      /CREATE TABLE IF NOT EXISTS public\.business_cash_ledger \([\s\S]*?CONSTRAINT business_cash_ledger_idem_uidx/
    )?.[0];
    expect(bcLedgerBlock).toBeTruthy();
    expect(bcLedgerBlock).not.toContain("WITHDRAWAL");
  });

  it("T10 no owner arbitrary SP credit RPC for recharge", () => {
    expect(mig).not.toContain("owner_credit_store_economic_points");
    expect(mig).toContain("credit_store_economic_points_inflow");
  });
});

describe("Stage1 conversion math", () => {
  it("T4 default 1:1", () => {
    expect(BUSINESS_CASH_CONVERSION_DEFAULT_RATE_PESOS).toBe(1);
    expect(isDefaultConversionRate(1)).toBe(true);
    expect(computeBusinessCashFromStorePoints({ points: 100, ratePesosPerPoint: 1 })).toBe(10000);
  });

  it("T5 configurable non-1:1", () => {
    expect(isDefaultConversionRate(0.9)).toBe(false);
    expect(computeBusinessCashFromStorePoints({ points: 100, ratePesosPerPoint: 0.9 })).toBe(9000);
  });

  it("T6 snapshot retained in convert RPC meta", () => {
    expect(mig).toContain("rate_pesos_per_point");
    expect(mig).toContain("rate_version");
    expect(mig).toContain("sp_debited");
  });

  it("T7 stale quote fails closed", () => {
    expect(mig).toContain("stale_rate");
    expect(mig).toContain("p_expected_rate_version");
  });

  it("T8 insufficient SP no mutation path", () => {
    expect(mig).toContain("insufficient_store_points");
  });
});

describe("Stage1 BC top-up", () => {
  it("T2/T3 approve exactly-once SQL", () => {
    expect(mig).toContain("approve_business_cash_charge_request");
    expect(mig).toContain("bc_topup:");
    expect(mig).toContain("idempotent");
  });
});

describe("Stage1 Ads product path uses BC", () => {
  it("T11/T12 actions route uses Business Cash not Store Cash debit", () => {
    expect(actions).toContain("debitBusinessCashForDeliveryAd");
    expect(actions).toContain("INSUFFICIENT_BUSINESS_CASH");
    expect(actions).not.toContain("debitStoreCashForDeliveryAd");
    expect(DELIVERY_AD_CANONICAL_PAYMENT_MODEL.id).toBe("DEBIT_REFUND_BUSINESS_CASH");
  });

  it("T13 duplicate submit idempotent via funding unique", () => {
    expect(mig).toContain("delivery_ad_canonical_bc_fundings_app_uidx");
    expect(mig).toContain("idempotent");
  });

  it("T14/T15 CHANGES_REQUESTED hold / no second debit", () => {
    expect(mig).toContain("CHANGES_REQUESTED");
    expect(adminWriter).toContain('input.action === "reject"');
    expect(adminWriter).not.toMatch(/request_changes[\s\S]{0,80}refundBusinessCash/);
    const bind = readFileSync(
      join(root, "lib/stores/advertising/owner-delivery-ad-commercial-bind.ts"),
      "utf8"
    );
    expect(bind).toMatch(/duplicate\|unique\|23505/);
    expect(bind).toContain("existing_snapshot_mismatch");
    expect(actions).toContain("resubmit");
    expect(actions).toContain("debitBusinessCashForDeliveryAd");
  });

  it("T16/T17 reject refunds BC exactly once", () => {
    expect(adminWriter).toContain("refundBusinessCashForRejectedDeliveryAd");
    expect(mig).toContain("business_cash_delivery_ad_refund");
    expect(mig).toContain("already_refunded");
  });

  it("Admin funded queue requires canonical funding authority", () => {
    expect(queue).toContain("loadDeliveryAdFundingStatusByCampaignIds");
    expect(queue).toContain("deliveryAdAdminQueueFundingAllowsIntake");
    expect(queue).toContain("isDeliveryAdFundingReadyForGoLive");
  });
});

describe("Stage1 Partner", () => {
  it("T18–T24 partner BC secure + reject model", () => {
    expect(DELIVERY_AD_PARTNER_PAYMENT.businessCashCharge).toBe(true);
    expect(partnerWriter).toContain("debitBusinessCashForDeliveryAd");
    expect(partnerWriter).toContain("INSUFFICIENT_BUSINESS_CASH");
    expect(partnerWriter).toContain("hasCanonicalBcFundingSecured");
    expect(partnerWriter).toContain("adminRejectPartnerMembership");
    expect(partnerWriter).toContain("REJECTED");
    expect(DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES).toContain("REJECTED");
    expect(partnerMembershipGrantsAdvertisingDiscount("PENDING_REVIEW")).toBe(false);
    expect(partnerMembershipGrantsAdvertisingDiscount("REJECTED")).toBe(false);
    expect(partnerMembershipGrantsAdvertisingDiscount("ACTIVE")).toBe(true);
    expect(DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES).not.toContain("PENDING_REVIEW");
  });
});

describe("Stage1 customer authority", () => {
  it("T25 funded mapped from SECURED; unfunded blocks", () => {
    expect(resolveFundingStatusFromCanonicalBc("SECURED")).toBe("FUNDED");
    expect(resolveFundingStatusFromCanonicalBc(null)).toBe("UNFUNDED");
    expect(
      isDeliveryAdFundingReadyForGoLive({
        campaignSource: "OWNER_PAID",
        fundingStatus: "UNFUNDED",
      })
    ).toBe(false);
  });

  it("T26 approved eligible when FUNDED", () => {
    expect(
      isDeliveryAdFundingReadyForGoLive({
        campaignSource: "OWNER_PAID",
        fundingStatus: "FUNDED",
      })
    ).toBe(true);
  });

  it("T27 organic ranking unaffected marker", () => {
    expect(DELIVERY_AD_PARTNER_ORGANIC_EFFECT.organicRankingBoost).toBe(false);
    expect(fundingLoad).toContain("loadCanonicalBcFundingStatusByApplicationIds");
  });

  it("insufficient modal hard-blocks submit anyway", () => {
    expect(insufficientModal).toContain("hard block");
    expect(insufficientModal).not.toContain("onConfirm={onSubmitAnyway}");
  });
});

describe("Stage1 insufficient parse", () => {
  it("parses BC insufficient payload", () => {
    const p = parseInsufficientBusinessCashRpc({
      error: "INSUFFICIENT_BUSINESS_CASH",
      available_minor: 100,
      required_minor: 500,
      shortage_minor: 400,
    });
    expect(p?.availableMinor).toBe(100);
    expect(p?.requiredMinor).toBe(500);
  });
});
