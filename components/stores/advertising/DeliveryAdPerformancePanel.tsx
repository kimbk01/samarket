"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdMetricNumber,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";

const RANGE_KEYS = {
  last_7d: "delivery_ads_perf_range_last_7d",
  last_30d: "delivery_ads_perf_range_last_30d",
  all: "delivery_ads_perf_range_all",
} as const satisfies Record<DeliveryAdAnalyticsDateRange, MessageKey>;

const RANGES = Object.keys(RANGE_KEYS) as DeliveryAdAnalyticsDateRange[];

const METRIC_KEYS = {
  impressions: "delivery_ads_perf_metric_impressions",
  clicks: "delivery_ads_perf_metric_clicks",
  ctr: "delivery_ads_perf_metric_ctr",
  orders: "delivery_ads_perf_metric_orders",
  sales: "delivery_ads_perf_metric_sales",
  spend: "delivery_ads_perf_metric_spend",
  roas: "delivery_ads_perf_metric_roas",
} as const satisfies Record<string, MessageKey>;

function formatMetric(
  m: DeliveryAdMetricNumber,
  kind: "count" | "ratio" | "money" | "roas",
  labels: {
    na: string;
    billing: string;
    notConfigured: string;
  }
): string {
  if (m.status === "billing_not_launched") return labels.billing;
  if (m.status === "not_configured") return labels.notConfigured;
  if (m.status === "not_available" || m.status === "no_data" || m.value == null) {
    return labels.na;
  }
  if (kind === "count") return String(Math.trunc(m.value));
  if (kind === "ratio") return `${(m.value * 100).toFixed(1)}%`;
  if (kind === "roas") return m.value.toFixed(2);
  return String(Math.trunc(m.value));
}

export function DeliveryAdPerformancePanel(props: {
  performance: DeliveryAdPerformancePayload | null;
  loading?: boolean;
  range: DeliveryAdAnalyticsDateRange;
  onRangeChange?: (range: DeliveryAdAnalyticsDateRange) => void;
  compact?: boolean;
}) {
  const { safeT } = useI18n();
  const labels = {
    na: safeT("delivery_ads_perf_not_available", {
      fallbackKo: "—",
      fallbackEn: "—",
    }),
    billing: safeT("delivery_ads_perf_billing_not_launched", {
      fallbackKo: "과금 미시작",
      fallbackEn: "Billing not launched",
    }),
    notConfigured: safeT("delivery_ads_perf_not_configured", {
      fallbackKo: "미설정",
      fallbackEn: "Not configured",
    }),
  };

  const rows: Array<{
    key: keyof typeof METRIC_KEYS;
    labelKo: string;
    labelEn: string;
    metric: DeliveryAdMetricNumber | null;
    kind: "count" | "ratio" | "money" | "roas";
  }> = props.performance
    ? [
        {
          key: "impressions",
          labelKo: "노출",
          labelEn: "Impressions",
          metric: props.performance.metrics.impressions,
          kind: "count",
        },
        {
          key: "clicks",
          labelKo: "클릭",
          labelEn: "Clicks",
          metric: props.performance.metrics.clicks,
          kind: "count",
        },
        {
          key: "ctr",
          labelKo: "CTR",
          labelEn: "CTR",
          metric: props.performance.metrics.ctr,
          kind: "ratio",
        },
        {
          key: "orders",
          labelKo: "광고 주문",
          labelEn: "Attributed orders",
          metric: props.performance.metrics.attributedOrders,
          kind: "count",
        },
        {
          key: "sales",
          labelKo: "광고 매출",
          labelEn: "Attributed sales",
          metric: props.performance.metrics.attributedSales,
          kind: "money",
        },
        {
          key: "spend",
          labelKo: "광고비",
          labelEn: "Net spend",
          metric: props.performance.metrics.netSpend,
          kind: "money",
        },
        {
          key: "roas",
          labelKo: "ROAS",
          labelEn: "ROAS",
          metric: props.performance.metrics.roas,
          kind: "roas",
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-sam-fg">
          {safeT("delivery_ads_perf_section_title", {
            fallbackKo: "광고 성과",
            fallbackEn: "Ad performance",
          })}
        </h3>
        {props.onRangeChange ? (
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`rounded-ui-rect border px-2 py-1 text-[11px] ${
                  props.range === r
                    ? "border-sam-brand bg-sam-brand/10 text-sam-fg"
                    : "border-sam-border text-sam-muted"
                }`}
                onClick={() => props.onRangeChange?.(r)}
              >
                {safeT(RANGE_KEYS[r], {
                  fallbackKo:
                    r === "last_7d" ? "7일" : r === "last_30d" ? "30일" : "전체",
                  fallbackEn:
                    r === "last_7d" ? "7d" : r === "last_30d" ? "30d" : "All",
                })}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {props.performance?.platform.billingStatus === "billing_not_launched" ? (
        <p className="text-[12px] text-sam-muted">
          {safeT("delivery_ads_perf_billing_banner", {
            fallbackKo: "광고 과금 정책이 아직 활성화되지 않았습니다.",
            fallbackEn: "Ad billing policy is not launched yet.",
          })}
        </p>
      ) : null}

      {props.performance?.platform.attributionStatus === "not_configured" ? (
        <p className="text-[12px] text-sam-muted">
          {safeT("delivery_ads_perf_attribution_banner", {
            fallbackKo: "주문 귀속 정책이 아직 설정되지 않았습니다.",
            fallbackEn: "Order attribution policy is not configured yet.",
          })}
        </p>
      ) : null}

      {props.loading ? (
        <p className="text-[13px] text-sam-muted">
          {safeT("delivery_ads_perf_loading", {
            fallbackKo: "성과를 불러오는 중…",
            fallbackEn: "Loading performance…",
          })}
        </p>
      ) : !props.performance ? (
        <p className="text-[13px] text-sam-muted">
          {safeT("delivery_ads_perf_empty", {
            fallbackKo: "아직 집계된 광고 성과가 없습니다.",
            fallbackEn: "No ad performance has been aggregated yet.",
          })}
        </p>
      ) : (
        <div
          className={`grid gap-2 ${props.compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}
        >
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-2"
            >
              <p className="text-[11px] text-sam-muted">
                {safeT(METRIC_KEYS[row.key], {
                  fallbackKo: row.labelKo,
                  fallbackEn: row.labelEn,
                })}
              </p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-sam-fg">
                {row.metric ? formatMetric(row.metric, row.kind, labels) : labels.na}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
