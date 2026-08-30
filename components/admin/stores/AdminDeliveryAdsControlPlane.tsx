"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import type { AdminDeliveryAdListBucket } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { AdminDeliveryAdListItem } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import type { MessageKey } from "@/lib/i18n/messages";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import { AdminDeliveryAdActionQueuePanel } from "@/components/admin/stores/AdminDeliveryAdActionQueuePanel";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";

const BUCKETS: AdminDeliveryAdListBucket[] = [
  "all",
  "review",
  "scheduled",
  "active",
  "held",
  "ended",
  "rejected",
];

type ProductFilter = "all" | "store_sponsored" | "banner";

function bucketLabelKey(b: AdminDeliveryAdListBucket): MessageKey {
  return `admin_delivery_ads_bucket_${b}` as MessageKey;
}

function productLabelKey(p: ProductFilter): MessageKey {
  return `admin_delivery_ads_product_${p}` as MessageKey;
}

function lifecycleLabelKey(status: string): MessageKey {
  return `admin_delivery_ads_lifecycle_${status.toLowerCase()}` as MessageKey;
}

export function AdminDeliveryAdsControlPlane() {
  const { t, safeT } = useI18n();
  const searchParams = useSearchParams();
  const inventoryFilter = searchParams.get("inventory")?.trim() || "";
  const primarySlugFilter =
    searchParams.get("primarySlug")?.trim() || searchParams.get("primary")?.trim() || "";
  const subSlugFilter =
    searchParams.get("subSlug")?.trim() || searchParams.get("sub")?.trim() || "";
  const [bucket, setBucket] = useState<AdminDeliveryAdListBucket>("all");
  const [product, setProduct] = useState<ProductFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<AdminDeliveryAdListItem[]>([]);
  const [policyCounts, setPolicyCounts] = useState<PolicyCampaignCounts | null>(null);
  const [summary, setSummary] = useState({
    total: 0,
    review: 0,
    active: 0,
    held: 0,
    ended: 0,
  });
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ bucket, product });
      if (inventoryFilter) qs.set("inventory", inventoryFilter);
      if (primarySlugFilter) qs.set("primarySlug", primarySlugFilter);
      if (subSlugFilter) qs.set("subSlug", subSlugFilter);
      const res = await fetch(`/api/admin/delivery-ads?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: AdminDeliveryAdListItem[];
        summary?: typeof summary;
        policyCounts?: PolicyCampaignCounts | null;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setCampaigns([]);
        setPolicyCounts(null);
        return;
      }
      setCampaigns(json.campaigns ?? []);
      setPolicyCounts(json.policyCounts ?? null);
      if (json.summary) setSummary(json.summary);
    } catch {
      setError("network_error");
      setCampaigns([]);
      setPolicyCounts(null);
    } finally {
      setLoading(false);
    }
  }, [bucket, product, inventoryFilter, primarySlugFilter, subSlugFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setPerfLoading(true);
    void fetch(
      `/api/admin/delivery-ads/performance?scope=all&range=${encodeURIComponent(perfRange)}`,
      { credentials: "include", cache: "no-store" }
    )
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          performance?: DeliveryAdPerformancePayload;
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.performance) setPerformance(json.performance);
        else setPerformance(null);
      })
      .catch(() => {
        if (!cancelled) setPerformance(null);
      })
      .finally(() => {
        if (!cancelled) setPerfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [perfRange]);

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4 pb-10" data-admin-delivery-ads-hub="1">
        {/* 1 — Page identity / summary */}
        <div data-admin-delivery-ads-section="identity">
          <p className="text-[12px] text-sam-muted">Delivery › Ads</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_title", {
              fallbackKo: "배달 광고 관리",
              fallbackEn: "Delivery ads",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_subtitle", {
              fallbackKo: "매장 홍보·배너 검수·운영 통합 제어",
              fallbackEn: "Unified Store Sponsored and Banner operations",
            })}
          </p>
          <p className="mt-2">
            <Link
              href={DELIVERY_AD_ADMIN_ROUTES.commercialSettings}
              className="text-[13px] font-medium text-signature underline"
              data-admin-delivery-ads-commercial-link="1"
            >
              {safeT("admin_delivery_ads_commercial_link", {
                fallbackKo: "광고 상품 설정",
                fallbackEn: "Ad product settings",
              })}
            </Link>
          </p>
          {inventoryFilter ? (
            <p className="mt-2 text-[12px] text-sam-fg">
              {t("admin_delivery_ads_filter_inventory")}:{" "}
              {deliveryAdPlacementI18nKeys([inventoryFilter])
                .map((k) => t(k as MessageKey))
                .join(" · ")}
              {primarySlugFilter ? ` · ${primarySlugFilter}` : ""}
              {subSlugFilter ? ` › ${subSlugFilter}` : ""}
            </p>
          ) : null}
          {policyCounts ? (
            <ul className="mt-2 flex flex-wrap gap-3 text-[12px] text-sam-fg">
              <li>
                {t("admin_delivery_ads_count_linked")}:{" "}
                <span className="font-semibold">{policyCounts.linked}</span>
              </li>
              <li>
                {t("admin_delivery_ads_count_exposable")}:{" "}
                <span className="font-semibold">{policyCounts.exposable_now}</span>
              </li>
              <li>
                {t("admin_delivery_ads_count_under_review")}:{" "}
                <span className="font-semibold">{policyCounts.under_review}</span>
              </li>
            </ul>
          ) : null}
        </div>

        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
          data-admin-delivery-ads-section="summary"
        >
          {(
            [
              ["total", summary.total],
              ["review", summary.review],
              ["active", summary.active],
              ["held", summary.held],
              ["ended", summary.ended],
            ] as const
          ).map(([k, v]) => (
            <AdminCard
              key={k}
              titleKey={
                (
                  {
                    total: "admin_delivery_ads_summary_total",
                    review: "admin_delivery_ads_summary_review",
                    active: "admin_delivery_ads_summary_active",
                    held: "admin_delivery_ads_summary_held",
                    ended: "admin_delivery_ads_summary_ended",
                  } as const
                )[k]
              }
            >
              <p className="text-[22px] font-semibold tabular-nums text-sam-fg">{v}</p>
            </AdminCard>
          ))}
        </div>

        {/* 2 — Action Queue ahead of passive browsing */}
        <div data-admin-delivery-ads-section="action-queue">
          <AdminDeliveryAdActionQueuePanel />
        </div>

        {/* 3 — Campaign control / existing list */}
        <div data-admin-delivery-ads-section="campaign-list">
          <h2 className="mb-2 text-[14px] font-semibold text-sam-fg">
            {safeT("admin_delivery_ads_campaign_list_title", {
              fallbackKo: "캠페인 목록",
              fallbackEn: "Campaign list",
            })}
          </h2>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("admin_delivery_ads_title")}>
            {BUCKETS.map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={bucket === b}
                className={`rounded-ui-rect border px-3 py-1.5 text-[12px] ${
                  bucket === b
                    ? "border-sam-brand bg-sam-brand/10 text-sam-fg"
                    : "border-sam-border bg-sam-surface text-sam-muted"
                }`}
                onClick={() => setBucket(b)}
              >
                {safeT(bucketLabelKey(b), {
                  fallbackKo: b,
                  fallbackEn: b,
                })}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {(["all", "store_sponsored", "banner"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`rounded-ui-rect border px-3 py-1.5 text-[12px] ${
                  product === p
                    ? "border-sam-brand bg-sam-brand/10 text-sam-fg"
                    : "border-sam-border bg-sam-surface text-sam-muted"
                }`}
                onClick={() => setProduct(p)}
              >
                {safeT(productLabelKey(p), { fallbackKo: p, fallbackEn: p })}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="mt-3 text-[13px] text-sam-muted" role="status">
              {safeT("admin_delivery_ads_loading", {
                fallbackKo: "불러오는 중…",
                fallbackEn: "Loading…",
              })}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-[13px] text-sam-danger" role="alert">
              {safeT("admin_delivery_ads_load_error", {
                fallbackKo: "목록을 불러오지 못했습니다.",
                fallbackEn: "Failed to load campaigns.",
              })}{" "}
              ({error})
            </p>
          ) : null}

          {!loading && !error && campaigns.length === 0 ? (
            <p className="mt-3 text-[13px] text-sam-muted">
              {safeT("admin_delivery_ads_empty", {
                fallbackKo: "해당 조건의 광고가 없습니다.",
                fallbackEn: "No campaigns for this filter.",
              })}
            </p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {campaigns.map((c) => (
              <li key={`${c.productKind}:${c.id}`}>
                <Link
                  href={`${DELIVERY_AD_ADMIN_ROUTES.detail(c.id)}?product=${c.productKind}`}
                  className="flex gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 hover:border-sam-brand"
                >
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-ui-rect bg-sam-app">
                    {c.productKind === "banner" && c.imageUrl ? (
                      <SamarketThumbnail
                        src={c.imageUrl}
                        alt=""
                        fill
                        fetchDisplayPx={160}
                        roundedClassName="rounded-ui-rect"
                      />
                    ) : c.storeThumbnailUrl ? (
                      <SamarketThumbnail
                        src={c.storeThumbnailUrl}
                        alt=""
                        fill
                        fetchDisplayPx={160}
                        roundedClassName="rounded-ui-rect"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-sam-muted">
                        —
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[10px] font-medium text-sam-fg">
                        {safeT(productLabelKey(c.productKind), {
                          fallbackKo: c.productKind,
                          fallbackEn: c.productKind,
                        })}
                      </span>
                      <span className="text-[12px] font-medium text-sam-fg">
                        {safeT(lifecycleLabelKey(c.lifecycleStatus), {
                          fallbackKo: c.lifecycleStatus,
                          fallbackEn: c.lifecycleStatus,
                        })}
                      </span>
                      {c.scheduleHint === "ended" && c.lifecycleStatus === "ACTIVE" ? (
                        <span className="text-[11px] text-sam-warning">
                          {safeT("admin_delivery_ads_schedule_ended_hint", {
                            fallbackKo: "일정 종료(표시)",
                            fallbackEn: "Schedule ended (display)",
                          })}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-sam-fg">
                      {c.storeName || c.title || c.id.slice(0, 8)}
                    </p>
                    <p className="truncate text-[11px] text-sam-muted">
                      {c.ownerDisplayName || c.ownerUserId || "—"} ·{" "}
                      {deliveryAdPlacementI18nKeys(c.inventoryKeys)
                        .map((k) => t(k as MessageKey))
                        .join(" · ") || "—"}{" "}
                      · {c.updatedAt.slice(0, 16)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* 4 — Secondary tools (performance) */}
        <div data-admin-delivery-ads-section="secondary">
          <AdminCard titleKey="delivery_ads_perf_section_title">
            <DeliveryAdPerformancePanel
              performance={performance}
              loading={perfLoading}
              range={perfRange}
              onRangeChange={setPerfRange}
            />
          </AdminCard>
        </div>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
