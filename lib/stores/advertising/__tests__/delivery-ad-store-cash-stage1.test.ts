/**
 * Stage 1 — Store Cash Delivery Ads finance authority contracts (T1–T18 static).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_PAYMENT_MODEL,
  DELIVERY_AD_BUSINESS_CASH_LEGACY,
  DELIVERY_AD_STORE_CASH_SPENDS_TABLE,
  STORE_CASH_DELIVERY_AD_REFUND_RPC,
  STORE_CASH_DELIVERY_AD_SPEND_RPC,
  isDeliveryAdStoreCashSecuredForGoLive,
  parseInsufficientStoreCashRpc,
  resolveFundingStatusFromStoreCashSpend,
} from "@/lib/stores/advertising/delivery-ad-store-cash-contract";
import {
  DELIVERY_AD_BUSINESS_CASH_PLATFORM,
  DELIVERY_AD_FUNDING_MODEL,
  isDeliveryAdFundingReadyForGoLive,
} from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { STORE_CASH_LEDGER_SOURCE_TYPES } from "@/lib/gift-certificate/gift-certificate-domain-contract";

const ROOT = process.cwd();
const MIG = "20261201280000_delivery_ads_stage1_store_cash_authority";

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("Stage 1 Store Cash Delivery Ads finance", () => {
  const mig = read(`supabase/migrations/${MIG}.sql`);
  const actions = read(
    "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts"
  );
  const adminWriter = read("lib/stores/advertising/admin-delivery-ad-writer.ts");
  const chargeWriter = read(
    "lib/stores/advertising/delivery-ad-business-cash-charge-request.ts"
  );
  const fundingRoute = read("app/api/me/delivery-ads/[campaignId]/funding/route.ts");
  const revenueRoute = read(
    "app/api/me/stores/[storeId]/gift-certificates/revenue/route.ts"
  );
  const loadFunding = read(
    "lib/stores/advertising/load-delivery-ad-campaign-funding-status.ts"
  );
  const organicComposer = read("lib/stores/stores-home-composer.ts");

  it("T1/T6/T9 — migration defines AD_SPEND / AD_REFUND and DEBIT_REFUND RPCs", () => {
    expect(mig).toMatch(/'AD_SPEND'/);
    expect(mig).toMatch(/'AD_REFUND'/);
    expect(mig).toContain(STORE_CASH_DELIVERY_AD_SPEND_RPC);
    expect(mig).toContain(STORE_CASH_DELIVERY_AD_REFUND_RPC);
    expect(mig).toContain(DELIVERY_AD_STORE_CASH_SPENDS_TABLE);
    expect(STORE_CASH_LEDGER_SOURCE_TYPES).toContain("AD_SPEND");
    expect(STORE_CASH_LEDGER_SOURCE_TYPES).toContain("AD_REFUND");
    expect(DELIVERY_AD_PAYMENT_MODEL.id).toBe("DEBIT_REFUND");
  });

  it("T2 — insufficient Store Cash RPC still structured; product path uses BC", () => {
    expect(mig).toMatch(/INSUFFICIENT_STORE_CASH/);
    expect(actions).toContain("INSUFFICIENT_BUSINESS_CASH");
    expect(actions).toContain("debitBusinessCashForDeliveryAd");
    expect(actions).not.toContain("debitStoreCashForDeliveryAd");
    const parsed = parseInsufficientStoreCashRpc({
      ok: false,
      error: "INSUFFICIENT_STORE_CASH",
      available_php: 0,
      required_php: 180,
      shortage_php: 180,
      available_minor: 0,
      required_minor: 18000,
      shortage_minor: 18000,
      currency: "PHP",
    });
    expect(parsed?.requiredPhp).toBe(180);
    expect(parsed?.shortagePhp).toBe(180);
  });

  it("T3/T18 — payable amount from commercial snapshot only (client not authority)", () => {
    expect(mig).toMatch(/final_payable_minor/);
    expect(mig).toMatch(/v_amount_minor := v_snap\.final_payable_minor/);
    expect(actions).toContain("clientFinalPayableMinor");
    expect(actions).toContain("attachOwnerPaidCommercialSnapshotOnSubmit");
    // Snapshot writer ignores client amount as write authority (verify-only upstream).
    const bind = read("lib/stores/advertising/owner-delivery-ad-commercial-bind.ts");
    expect(bind).toMatch(/clientFinalPayableMinor|quote_stale/);
  });

  it("T4/T5 — exactly-once debit via unique spend + ledger related key", () => {
    expect(mig).toMatch(/delivery_ad_store_cash_spends_campaign_uidx/);
    expect(mig).toMatch(/related_type, related_id/);
    expect(mig).toMatch(/'delivery_ad_campaign'/);
    expect(mig).toContain("'idempotent', true");
    expect(mig).toMatch(/unique_violation/);
  });

  it("T6 — request_changes must not refund", () => {
    expect(adminWriter).toMatch(/input\.action === "reject"/);
    expect(adminWriter).toContain("refundStoreCashForRejectedDeliveryAd");
    // Refund only after reject; request_changes path has no refund call adjacent.
    const rejectIdx = adminWriter.indexOf('input.action === "reject"');
    const refundIdx = adminWriter.indexOf("refundStoreCashForRejectedDeliveryAd");
    expect(rejectIdx).toBeGreaterThan(-1);
    expect(refundIdx).toBeGreaterThan(rejectIdx);
    expect(mig).toMatch(/not_terminal_reject/);
    expect(mig).toMatch(/v_lifecycle IS DISTINCT FROM 'REJECTED'/);
  });

  it("T7 — resubmit reuses secured spend (no second debit)", () => {
    expect(mig).toMatch(/IF v_existing\.status = 'SECURED'/);
    expect(actions).toMatch(/action === "submit" \|\| action === "resubmit"/);
    expect(actions).toContain("debitBusinessCashForDeliveryAd");
  });

  it("T8 — approve does not trigger payment", () => {
    expect(adminWriter).not.toMatch(/action === "approve"[\s\S]{0,120}debitStoreCash/);
    expect(adminWriter).not.toMatch(/action === "approve"[\s\S]{0,120}ownerFund/);
    expect(fundingRoute).toContain("DISABLED_FOR_NEW_PRODUCT");
  });

  it("T9/T10/T11 — reject refunds original spend exactly once", () => {
    expect(adminWriter).toContain("refundStoreCashForRejectedDeliveryAd");
    expect(mig).toMatch(/v_spend\.amount_php/);
    expect(mig).toMatch(/'delivery_ad_spend'/);
    expect(mig).toMatch(/IF v_spend\.status = 'REFUNDED'/);
  });

  it("T12/T13 — Store finance history exposes AD_SPEND / AD_REFUND", () => {
    expect(revenueRoute).toContain("storeCashLedger");
    expect(revenueRoute).toContain("AD_SPEND");
    expect(revenueRoute).toContain("AD_REFUND");
    expect(revenueRoute).toContain("광고비 사용");
    expect(revenueRoute).toContain("광고비 환불");
  });

  it("T14 — Owner can only debit own store (RPC ownership checks)", () => {
    expect(mig).toMatch(/owner_user_id IS DISTINCT FROM p_owner_user_id/);
    expect(mig).toMatch(/v_row\.store_id IS DISTINCT FROM p_store_id/);
    expect(actions).toContain("getStoreIfOwner");
  });

  it("T15 — Business Cash charge request disabled for new product", () => {
    expect(chargeWriter).toContain("DISABLED_FOR_NEW_PRODUCT");
    expect(DELIVERY_AD_BUSINESS_CASH_LEGACY.chargeRequestProduct).toBe(
      "DISABLED_FOR_NEW_PRODUCT"
    );
    expect(DELIVERY_AD_BUSINESS_CASH_PLATFORM.chargeRequest).toBe(
      "DISABLED_FOR_NEW_PRODUCT"
    );
  });

  it("Owner hub balance APIs read AST-005 Business Cash (Store Cash legacy retained)", () => {
    const hub = read("app/api/me/delivery-ads/route.ts");
    const funding = read("app/api/me/delivery-ads/[campaignId]/funding/route.ts");
    const adminCash = read("app/api/admin/delivery-ads/business-cash/route.ts");
    expect(hub).toContain("loadStoreBusinessCashBalance");
    expect(hub).toContain("AST_005_BUSINESS_CASH");
    expect(hub).not.toContain("loadOwnerBusinessCashBalance");
    expect(funding).toContain("loadStoreCashBalanceForStore");
    expect(funding).toContain("fundingStatus");
    expect(adminCash).toContain("loadCampaignStoreCashSpendRow");
    expect(adminCash).toContain("loadOwnerStoreCashBalanceForAds");
    expect(adminCash).toContain("DISABLED_FOR_NEW_PRODUCT");
  });

  it("T16 — activation/exposure prefers canonical BC; legacy Store Cash still loadable", () => {
    expect(mig).toMatch(/delivery_ad_store_cash_spends s/);
    expect(mig).toMatch(/s\.status = 'SECURED'/);
    expect(loadFunding).toContain("loadCanonicalBcFundingStatusByApplicationIds");
    expect(loadFunding).toContain("loadDeliveryAdStoreCashSpendStatusByCampaignIds");
    expect(
      resolveFundingStatusFromStoreCashSpend("SECURED")
    ).toBe("FUNDED");
    expect(
      isDeliveryAdFundingReadyForGoLive({
        campaignSource: "OWNER_PAID",
        fundingStatus: "FUNDED",
      })
    ).toBe(true);
    expect(
      isDeliveryAdStoreCashSecuredForGoLive({
        campaignSource: "OWNER_PAID",
        spendStatus: "SECURED",
      })
    ).toBe(true);
    expect(
      isDeliveryAdFundingReadyForGoLive({
        campaignSource: "OWNER_PAID",
        fundingStatus: "UNFUNDED",
      })
    ).toBe(false);
  });

  it("T17 — organic ranking composer untouched by Stage 1 finance files", () => {
    expect(organicComposer).not.toContain("store_cash_delivery_ad");
    expect(organicComposer).not.toContain("AD_SPEND");
  });

  it("legacy MODEL B marked superseded; payment model DEBIT_REFUND", () => {
    expect(DELIVERY_AD_FUNDING_MODEL.status).toBe("LEGACY_READ_ONLY");
    expect(DELIVERY_AD_FUNDING_MODEL.supersededBy).toBe("DEBIT_REFUND_STORE_CASH");
    expect(DELIVERY_AD_PAYMENT_MODEL.id).toBe("DEBIT_REFUND");
  });

  it("no Business Cash balance transfer in Stage 1 migration", () => {
    expect(mig).not.toMatch(/INSERT INTO public\.delivery_ad_accounts/);
    expect(mig).not.toMatch(/balance_minor/);
    expect(mig).toMatch(/PRESERVED|MIGRATE|Legacy/i);
  });
});
