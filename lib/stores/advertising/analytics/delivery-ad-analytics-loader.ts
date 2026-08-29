/**
 * CUT I — Delivery Ads performance loader (service-role aggregate RPCs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CUT_I_ANALYTICS_AUTHORITY,
  assembleDeliveryAdPerformanceMetrics,
  buildDeliveryAdAnalyticsPlatformStatus,
  emptyDeliveryAdPerformanceMetrics,
  isDeliveryAdAnalyticsDateRange,
  resolveDeliveryAdAnalyticsRange,
  type DeliveryAdAnalyticsDateRange,
  type DeliveryAdPerformanceMetrics,
  type DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";

export type DeliveryAdPerformanceBreakdownRow = {
  key: string;
  metrics: DeliveryAdPerformanceMetrics;
};

type RpcTotals = {
  impressions?: number;
  clicks?: number;
  attributed_orders?: number;
  gross_spend_minor?: number;
  refunds_minor?: number;
};

type RpcCampaignRow = RpcTotals & { campaign_id?: string };

function toInt(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.trunc(v);
}

function metricsFromRpcTotals(
  row: RpcTotals,
  platform: ReturnType<typeof buildDeliveryAdAnalyticsPlatformStatus>
): DeliveryAdPerformanceMetrics {
  return assembleDeliveryAdPerformanceMetrics({
    impressions: toInt(row.impressions),
    clicks: toInt(row.clicks),
    attributedOrders: toInt(row.attributed_orders),
    grossSpendMinor: toInt(row.gross_spend_minor),
    refundsMinor: toInt(row.refunds_minor),
    platform,
  });
}

export async function loadDeliveryAdPerformance(
  sb: SupabaseClient,
  input: {
    campaignIds: string[];
    range?: DeliveryAdAnalyticsDateRange | string | null;
    /** Admin may pass null to aggregate all campaigns (bounded by RPC). */
    allCampaigns?: boolean;
  }
): Promise<{ ok: true; payload: DeliveryAdPerformancePayload } | { ok: false; error: string }> {
  const range: DeliveryAdAnalyticsDateRange = isDeliveryAdAnalyticsDateRange(input.range)
    ? input.range
    : "last_30d";
  const { startIso, endIso } = resolveDeliveryAdAnalyticsRange(range);

  try {
    const { data, error } = await sb.rpc(CUT_I_ANALYTICS_AUTHORITY.aggregateRpc, {
      p_campaign_ids: input.allCampaigns === true ? null : input.campaignIds,
      p_range_start: startIso,
      p_range_end: endIso,
    });
    if (error) {
      console.error("[delivery-ad-analytics]", error.message);
      return { ok: false, error: "rpc_failed" };
    }

    const payload = data as {
      ok?: boolean;
      error?: string;
      billing_enabled?: boolean;
      attribution_configured?: boolean;
      totals?: RpcTotals;
      by_campaign?: RpcCampaignRow[];
    } | null;

    if (!payload?.ok) {
      return { ok: false, error: payload?.error || "aggregate_failed" };
    }

    const platform = buildDeliveryAdAnalyticsPlatformStatus({
      billingEnabled: payload.billing_enabled === true,
      attributionConfigured: payload.attribution_configured === true,
    });

    const totals = payload.totals ?? {};
    const metrics =
      input.allCampaigns !== true && input.campaignIds.length === 0
        ? emptyDeliveryAdPerformanceMetrics(platform)
        : metricsFromRpcTotals(totals, platform);

    const byCampaign = (payload.by_campaign ?? [])
      .filter((r) => typeof r.campaign_id === "string" && r.campaign_id.length > 0)
      .map((r) => ({
        campaignId: String(r.campaign_id),
        metrics: metricsFromRpcTotals(r, platform),
      }));

    return {
      ok: true,
      payload: {
        range,
        rangeStartIso: startIso,
        rangeEndIso: endIso,
        timezone: "UTC",
        platform,
        metrics,
        byCampaign,
      },
    };
  } catch (e) {
    console.error("[delivery-ad-analytics]", e instanceof Error ? e.message : e);
    return { ok: false, error: "rpc_failed" };
  }
}

export async function loadDeliveryAdPerformanceBreakdown(
  sb: SupabaseClient,
  input: {
    campaignIds: string[] | null;
    groupBy: "product" | "inventory" | "campaign" | "day";
    range?: DeliveryAdAnalyticsDateRange | string | null;
  }
): Promise<
  | { ok: true; platform: ReturnType<typeof buildDeliveryAdAnalyticsPlatformStatus>; rows: DeliveryAdPerformanceBreakdownRow[] }
  | { ok: false; error: string }
> {
  const range: DeliveryAdAnalyticsDateRange = isDeliveryAdAnalyticsDateRange(input.range)
    ? input.range
    : "last_30d";
  const { startIso, endIso } = resolveDeliveryAdAnalyticsRange(range);

  try {
    const { data, error } = await sb.rpc(CUT_I_ANALYTICS_AUTHORITY.breakdownRpc, {
      p_campaign_ids: input.campaignIds,
      p_group_by: input.groupBy,
      p_range_start: startIso,
      p_range_end: endIso,
    });
    if (error) return { ok: false, error: "rpc_failed" };
    const payload = data as {
      ok?: boolean;
      error?: string;
      billing_enabled?: boolean;
      attribution_configured?: boolean;
      rows?: Array<RpcTotals & { bucket_key?: string }>;
    } | null;
    if (!payload?.ok) return { ok: false, error: payload?.error || "breakdown_failed" };

    const platform = buildDeliveryAdAnalyticsPlatformStatus({
      billingEnabled: payload.billing_enabled === true,
      attributionConfigured: payload.attribution_configured === true,
    });

    return {
      ok: true,
      platform,
      rows: (payload.rows ?? []).map((r) => ({
        key: String(r.bucket_key ?? ""),
        metrics: metricsFromRpcTotals(r, platform),
      })),
    };
  } catch {
    return { ok: false, error: "rpc_failed" };
  }
}
