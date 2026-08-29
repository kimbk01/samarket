/**
 * CUT I — Delivery Ads performance analytics metric contract.
 * Consumes CUT G events + CUT H ledgers only. No new business truth.
 */

import { DELIVERY_AD_ATTRIBUTION_POLICY } from "@/lib/stores/advertising/delivery-ad-event-contract";
import { DELIVERY_AD_BILLING_PLATFORM } from "@/lib/stores/advertising/delivery-ad-billing-contract";

export const DELIVERY_AD_ANALYTICS_TIMEZONE = "UTC" as const;

/**
 * Attributed advertising sales amount basis — not wired.
 * Merchant Delivery sales SSOT (payment_amount on completed) is NOT adopted
 * as ad attributed-sales authority until business configures ORDER_PERCENT / sales basis.
 */
export const DELIVERY_AD_ATTRIBUTED_SALES_AUTHORITY = {
  status: "NOT_CONFIGURED" as const,
  note: "No proven attributed-ad sales field. Do not invent subtotal/total/payment_amount as ad sales.",
} as const;

/** Cancelled attributions preserved in CUT G; conversion count uses ATTRIBUTED only. */
export const DELIVERY_AD_ATTRIBUTED_ORDER_COUNT_POLICY = {
  includeStatuses: ["ATTRIBUTED"] as const,
  excludeStatuses: ["ORDER_CANCELLED"] as const,
  note: "ORDER_CANCELLED rows preserved as history; excluded from attributed_orders conversion count.",
} as const;

export const DELIVERY_AD_ANALYTICS_DATE_RANGES = ["last_7d", "last_30d", "all"] as const;
export type DeliveryAdAnalyticsDateRange = (typeof DELIVERY_AD_ANALYTICS_DATE_RANGES)[number];

export type DeliveryAdMetricAvailability =
  | "available"
  | "not_configured"
  | "billing_not_launched"
  | "not_available"
  | "no_data";

export type DeliveryAdMetricNumber = {
  status: DeliveryAdMetricAvailability;
  value: number | null;
};

export type DeliveryAdPerformanceMetrics = {
  impressions: DeliveryAdMetricNumber;
  clicks: DeliveryAdMetricNumber;
  ctr: DeliveryAdMetricNumber;
  attributedOrders: DeliveryAdMetricNumber;
  attributedSales: DeliveryAdMetricNumber;
  grossSpend: DeliveryAdMetricNumber;
  refunds: DeliveryAdMetricNumber;
  netSpend: DeliveryAdMetricNumber;
  roas: DeliveryAdMetricNumber;
};

export type DeliveryAdAnalyticsPlatformStatus = {
  billingStatus: "billing_not_launched" | "available";
  attributionStatus: "not_configured" | "configured";
  attributedSalesStatus: "not_configured";
  pricingStatus: "not_configured";
};

export type DeliveryAdPerformancePayload = {
  range: DeliveryAdAnalyticsDateRange;
  rangeStartIso: string | null;
  rangeEndIso: string | null;
  timezone: typeof DELIVERY_AD_ANALYTICS_TIMEZONE;
  platform: DeliveryAdAnalyticsPlatformStatus;
  metrics: DeliveryAdPerformanceMetrics;
  byCampaign?: Array<{ campaignId: string; metrics: DeliveryAdPerformanceMetrics }>;
};

export function isDeliveryAdAnalyticsDateRange(v: unknown): v is DeliveryAdAnalyticsDateRange {
  return (
    typeof v === "string" &&
    (DELIVERY_AD_ANALYTICS_DATE_RANGES as readonly string[]).includes(v)
  );
}

/** UTC day-aligned window (settlement financial pattern). */
export function resolveDeliveryAdAnalyticsRange(
  range: DeliveryAdAnalyticsDateRange,
  now = new Date()
): { startIso: string | null; endIso: string | null } {
  if (range === "all") return { startIso: null, endIso: null };
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );
  const days = range === "last_7d" ? 7 : 30;
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function computeDeliveryAdCtr(
  impressions: number,
  clicks: number
): DeliveryAdMetricNumber {
  if (!Number.isFinite(impressions) || impressions < 0) {
    return { status: "not_available", value: null };
  }
  if (impressions === 0) return { status: "not_available", value: null };
  if (!Number.isFinite(clicks) || clicks < 0) {
    return { status: "not_available", value: null };
  }
  return { status: "available", value: clicks / impressions };
}

export function computeDeliveryAdRoas(input: {
  attributedSalesStatus: DeliveryAdMetricAvailability;
  attributedSalesMinor: number | null;
  netSpendStatus: DeliveryAdMetricAvailability;
  netSpendMinor: number | null;
}): DeliveryAdMetricNumber {
  if (input.attributedSalesStatus !== "available" || input.attributedSalesMinor == null) {
    return { status: "not_available", value: null };
  }
  if (input.netSpendStatus === "billing_not_launched" || input.netSpendStatus === "not_configured") {
    return { status: input.netSpendStatus, value: null };
  }
  if (input.netSpendStatus !== "available" || input.netSpendMinor == null || input.netSpendMinor <= 0) {
    return { status: "not_available", value: null };
  }
  return {
    status: "available",
    value: input.attributedSalesMinor / input.netSpendMinor,
  };
}

export function buildDeliveryAdAnalyticsPlatformStatus(input?: {
  billingEnabled?: boolean;
  attributionConfigured?: boolean;
}): DeliveryAdAnalyticsPlatformStatus {
  const billingEnabled =
    input?.billingEnabled ?? (DELIVERY_AD_BILLING_PLATFORM.isEnabled as boolean);
  const attributionConfigured =
    input?.attributionConfigured ??
    ((DELIVERY_AD_ATTRIBUTION_POLICY.isActive as boolean) &&
      DELIVERY_AD_ATTRIBUTION_POLICY.clickWindowSeconds != null);
  return {
    billingStatus: billingEnabled ? "available" : "billing_not_launched",
    attributionStatus: attributionConfigured ? "configured" : "not_configured",
    attributedSalesStatus: "not_configured",
    pricingStatus: "not_configured",
  };
}

export function emptyDeliveryAdPerformanceMetrics(
  platform: DeliveryAdAnalyticsPlatformStatus
): DeliveryAdPerformanceMetrics {
  const spendStatus: DeliveryAdMetricAvailability =
    platform.billingStatus === "billing_not_launched"
      ? "billing_not_launched"
      : "available";
  return {
    impressions: { status: "available", value: 0 },
    clicks: { status: "available", value: 0 },
    ctr: { status: "not_available", value: null },
    attributedOrders: { status: "available", value: 0 },
    attributedSales: { status: "not_configured", value: null },
    grossSpend: { status: spendStatus, value: spendStatus === "available" ? 0 : null },
    refunds: { status: spendStatus, value: spendStatus === "available" ? 0 : null },
    netSpend: { status: spendStatus, value: spendStatus === "available" ? 0 : null },
    roas: { status: "not_available", value: null },
  };
}

export function assembleDeliveryAdPerformanceMetrics(input: {
  impressions: number;
  clicks: number;
  attributedOrders: number;
  grossSpendMinor: number;
  refundsMinor: number;
  platform: DeliveryAdAnalyticsPlatformStatus;
}): DeliveryAdPerformanceMetrics {
  const spendStatus: DeliveryAdMetricAvailability =
    platformSpendStatus(input.platform);
  const net =
    spendStatus === "available"
      ? input.grossSpendMinor - input.refundsMinor
      : null;
  const attributedSales: DeliveryAdMetricNumber = {
    status: "not_configured",
    value: null,
  };
  const grossSpend: DeliveryAdMetricNumber = {
    status: spendStatus,
    value: spendStatus === "available" ? input.grossSpendMinor : null,
  };
  const refunds: DeliveryAdMetricNumber = {
    status: spendStatus,
    value: spendStatus === "available" ? input.refundsMinor : null,
  };
  const netSpend: DeliveryAdMetricNumber = {
    status: spendStatus,
    value: net,
  };
  return {
    impressions: { status: "available", value: input.impressions },
    clicks: { status: "available", value: input.clicks },
    ctr: computeDeliveryAdCtr(input.impressions, input.clicks),
    attributedOrders: { status: "available", value: input.attributedOrders },
    attributedSales,
    grossSpend,
    refunds,
    netSpend,
    roas: computeDeliveryAdRoas({
      attributedSalesStatus: attributedSales.status,
      attributedSalesMinor: attributedSales.value,
      netSpendStatus: netSpend.status,
      netSpendMinor: netSpend.value,
    }),
  };
}

function platformSpendStatus(
  platform: DeliveryAdAnalyticsPlatformStatus
): DeliveryAdMetricAvailability {
  return platform.billingStatus === "billing_not_launched"
    ? "billing_not_launched"
    : "available";
}

export const CUT_I_ANALYTICS_AUTHORITY = {
  cut: "I" as const,
  aggregateRpc: "get_delivery_ad_performance",
  breakdownRpc: "get_delivery_ad_performance_breakdown",
  executeGrant: "service_role_only",
  attributedSales: DELIVERY_AD_ATTRIBUTED_SALES_AUTHORITY.status,
} as const;
