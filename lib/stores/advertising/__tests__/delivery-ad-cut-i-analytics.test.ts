/**
 * CUT I — Delivery Ads performance analytics contract tests (I1–I41).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUT_I_ANALYTICS_AUTHORITY,
  DELIVERY_AD_ATTRIBUTED_ORDER_COUNT_POLICY,
  DELIVERY_AD_ATTRIBUTED_SALES_AUTHORITY,
  DELIVERY_AD_ANALYTICS_TIMEZONE,
  assembleDeliveryAdPerformanceMetrics,
  buildDeliveryAdAnalyticsPlatformStatus,
  computeDeliveryAdCtr,
  computeDeliveryAdRoas,
  emptyDeliveryAdPerformanceMetrics,
  resolveDeliveryAdAnalyticsRange,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import { DELIVERY_AD_BILLING_PLATFORM } from "@/lib/stores/advertising/delivery-ad-billing-contract";
import { DELIVERY_AD_ATTRIBUTION_POLICY } from "@/lib/stores/advertising/delivery-ad-event-contract";
import { DELIVERY_AD_ORGANIC_PAID_ISOLATION } from "@/lib/stores/advertising/delivery-ad-domain";
import { STORE_SPONSORED_BUDGET_GATE } from "@/lib/stores/advertising/delivery-ad-billing-contract";

const mig = () =>
  readFileSync(
    join(process.cwd(), "supabase/migrations/20261201180000_delivery_ads_cut_i_performance_rpc.sql"),
    "utf8"
  );

describe("CUT I Delivery Ads performance analytics", () => {
  it("I1/I2 impressions and clicks assembled from counts", () => {
    const platform = buildDeliveryAdAnalyticsPlatformStatus({ billingEnabled: false });
    const m = assembleDeliveryAdPerformanceMetrics({
      impressions: 100,
      clicks: 7,
      attributedOrders: 0,
      grossSpendMinor: 0,
      refundsMinor: 0,
      platform,
    });
    expect(m.impressions).toEqual({ status: "available", value: 100 });
    expect(m.clicks).toEqual({ status: "available", value: 7 });
  });

  it("I3 CTR calculation", () => {
    expect(computeDeliveryAdCtr(100, 25).value).toBe(0.25);
  });

  it("I4 zero impressions does not NaN/Infinity", () => {
    const ctr = computeDeliveryAdCtr(0, 5);
    expect(ctr.status).toBe("not_available");
    expect(ctr.value).toBeNull();
    expect(Number.isFinite(ctr.value as number)).toBe(false);
  });

  it("I5 attributed orders from ATTRIBUTED status only (contract)", () => {
    expect(DELIVERY_AD_ATTRIBUTED_ORDER_COUNT_POLICY.includeStatuses).toEqual(["ATTRIBUTED"]);
    expect(DELIVERY_AD_ATTRIBUTED_ORDER_COUNT_POLICY.excludeStatuses).toContain("ORDER_CANCELLED");
    expect(mig()).toContain("attribution_status = 'ATTRIBUTED'");
  });

  it("I6–I8 gross/refund/net spend from ledger aggregates when billing available", () => {
    const platform = buildDeliveryAdAnalyticsPlatformStatus({ billingEnabled: true });
    const m = assembleDeliveryAdPerformanceMetrics({
      impressions: 0,
      clicks: 0,
      attributedOrders: 0,
      grossSpendMinor: 1000,
      refundsMinor: 200,
      platform,
    });
    expect(m.grossSpend).toEqual({ status: "available", value: 1000 });
    expect(m.refunds).toEqual({ status: "available", value: 200 });
    expect(m.netSpend).toEqual({ status: "available", value: 800 });
  });

  it("I9 ROAS when sales + net spend available", () => {
    const roas = computeDeliveryAdRoas({
      attributedSalesStatus: "available",
      attributedSalesMinor: 4000,
      netSpendStatus: "available",
      netSpendMinor: 1000,
    });
    expect(roas).toEqual({ status: "available", value: 4 });
  });

  it("I10 ROAS unavailable when billing disabled", () => {
    const platform = buildDeliveryAdAnalyticsPlatformStatus({ billingEnabled: false });
    const m = assembleDeliveryAdPerformanceMetrics({
      impressions: 10,
      clicks: 1,
      attributedOrders: 0,
      grossSpendMinor: 0,
      refundsMinor: 0,
      platform,
    });
    expect(m.netSpend.status).toBe("billing_not_launched");
    expect(m.roas.status).toBe("not_available");
    expect(m.roas.value).toBeNull();
  });

  it("I11 billing disabled != spend ₱0 semantic", () => {
    const platform = buildDeliveryAdAnalyticsPlatformStatus({ billingEnabled: false });
    const empty = emptyDeliveryAdPerformanceMetrics(platform);
    expect(empty.grossSpend.status).toBe("billing_not_launched");
    expect(empty.grossSpend.value).toBeNull();
    expect(empty.netSpend.value).toBeNull();
  });

  it("I12 pricing not configured surfaced", () => {
    expect(buildDeliveryAdAnalyticsPlatformStatus().pricingStatus).toBe("not_configured");
  });

  it("I13 attribution policy not configured surfaced", () => {
    expect(DELIVERY_AD_ATTRIBUTION_POLICY.status).toBe("NOT_CONFIGURED");
    expect(buildDeliveryAdAnalyticsPlatformStatus().attributionStatus).toBe("not_configured");
  });

  it("I14 no-data vs not-configured (impressions available at 0)", () => {
    const platform = buildDeliveryAdAnalyticsPlatformStatus({ billingEnabled: false });
    const m = emptyDeliveryAdPerformanceMetrics(platform);
    expect(m.impressions).toEqual({ status: "available", value: 0 });
    expect(m.attributedSales.status).toBe("not_configured");
  });

  it("I15 attributed sales unavailable blocks ROAS", () => {
    expect(DELIVERY_AD_ATTRIBUTED_SALES_AUTHORITY.status).toBe("NOT_CONFIGURED");
    const platform = buildDeliveryAdAnalyticsPlatformStatus({ billingEnabled: true });
    const m = assembleDeliveryAdPerformanceMetrics({
      impressions: 1,
      clicks: 1,
      attributedOrders: 1,
      grossSpendMinor: 500,
      refundsMinor: 0,
      platform,
    });
    expect(m.attributedSales.status).toBe("not_configured");
    expect(m.roas.status).toBe("not_available");
  });

  it("I16–I21 auth/RPC security contracts", () => {
    const ownerPerf = readFileSync(
      join(process.cwd(), "app/api/me/delivery-ads/performance/route.ts"),
      "utf8"
    );
    const ownerCamp = readFileSync(
      join(process.cwd(), "app/api/me/delivery-ads/[campaignId]/performance/route.ts"),
      "utf8"
    );
    const adminPerf = readFileSync(
      join(process.cwd(), "app/api/admin/delivery-ads/performance/route.ts"),
      "utf8"
    );
    expect(ownerPerf).toContain("getRouteUserId");
    expect(ownerCamp).toContain("forbidden");
    expect(ownerCamp).toContain("owned.has");
    expect(adminPerf).toContain("requireAdminApiUser");
    expect(mig()).toMatch(/REVOKE ALL ON FUNCTION public\.get_delivery_ad_performance[\s\S]*FROM anon, authenticated/);
    expect(mig()).toContain("GRANT EXECUTE ON FUNCTION public.get_delivery_ad_performance");
    expect(mig()).toContain("TO service_role");
    expect(ownerPerf).not.toContain("viewer_session_hash");
    expect(adminPerf).not.toContain("viewer_session_hash");
  });

  it("I22–I26 breakdown + date range + timezone", () => {
    expect(mig()).toContain("p_group_by");
    expect(mig()).toContain("'product'");
    expect(mig()).toContain("'inventory'");
    expect(mig()).toContain("'campaign'");
    expect(mig()).toContain("'day'");
    expect(DELIVERY_AD_ANALYTICS_TIMEZONE).toBe("UTC");
    const r7 = resolveDeliveryAdAnalyticsRange("last_7d", new Date("2026-08-30T12:00:00.000Z"));
    expect(r7.startIso?.startsWith("2026-08-24")).toBe(true);
    expect(r7.endIso?.startsWith("2026-08-30")).toBe(true);
    const all = resolveDeliveryAdAnalyticsRange("all");
    expect(all.startIso).toBeNull();
  });

  it("I27–I30 history / refund semantics in RPC (no charge mutation)", () => {
    expect(mig()).toContain("delivery_ad_charge_ledger");
    expect(mig()).toContain("delivery_ad_refund_ledger");
    expect(mig()).not.toMatch(/UPDATE public\.delivery_ad_charge_ledger/);
    expect(mig()).toContain("get_delivery_ad_performance");
  });

  it("I31–I34 batch aggregate (no N+1 contract)", () => {
    expect(CUT_I_ANALYTICS_AUTHORITY.aggregateRpc).toBe("get_delivery_ad_performance");
    const loader = readFileSync(
      join(process.cwd(), "lib/stores/advertising/analytics/delivery-ad-analytics-loader.ts"),
      "utf8"
    );
    expect(loader).toContain("by_campaign");
    const adminList = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminDeliveryAdsControlPlane.tsx"),
      "utf8"
    );
    expect(adminList).not.toMatch(/campaigns\.map[\s\S]*performance\?/);
  });

  it("I35–I41 regression locks", () => {
    expect(DELIVERY_AD_BILLING_PLATFORM.isEnabled).toBe(false);
    expect(STORE_SPONSORED_BUDGET_GATE.status).toBe("BILLING_NOT_LAUNCHED");
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION).toBeTruthy();
    const gWriter = readFileSync(
      join(process.cwd(), "lib/stores/advertising/delivery-ad-event-writer.ts"),
      "utf8"
    );
    expect(gWriter).toContain("delivery_ad_record_impression");
    const banner = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(banner).toContain("DeliveryAdBanner");
    const adminActions = readFileSync(
      join(process.cwd(), "lib/stores/advertising/admin-delivery-ad-contract.ts"),
      "utf8"
    );
    expect(adminActions).toContain("approve");
    expect(adminActions).toContain("terminate");
  });

  it("shared metric authority + no fake spend UI", () => {
    const panel = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdPerformancePanel.tsx"),
      "utf8"
    );
    expect(panel).toContain("billing_not_launched");
    expect(panel).not.toMatch(/ROAS.*0%/);
    expect(CUT_I_ANALYTICS_AUTHORITY.attributedSales).toBe("NOT_CONFIGURED");
  });
});
