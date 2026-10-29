"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import type { AdminDeliveryAdListItem } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import type { MessageKey } from "@/lib/i18n/messages";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import { DeliveryAdAdminTodaySummary } from "@/components/stores/advertising/DeliveryAdAdminTodaySummary";
import { AdminDeliveryAdActionQueuePanel } from "@/components/admin/stores/AdminDeliveryAdActionQueuePanel";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import {
  ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW,
  type AdminDeliveryAdsHubView,
  adminDeliveryAdHubRowPrimaryCta,
  adminDeliveryAdInventoryHumanLabel,
  adminDeliveryAdProductLabelKey,
  adminDeliveryAdCampaignSourceLabelKey,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import {
  emptyAdminHubTodayCounts,
  type AdminHubTodayCounts,
} from "@/lib/stores/advertising/delivery-ad-admin-hub-today-counts";
import { isDeliveryBannerCreativeAssetReady as creativeReady } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { ARO_IA_001_COMMUNITY_PROMOTIONS_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { adminDisplayApplicantLabel } from "@/lib/admin/operator-ux/operator-labels";

type ProductFilter = "all" | "store_sponsored" | "banner";
const PRODUCT_FILTERS: readonly ProductFilter[] = ["all", "store_sponsored", "banner"];

const HUB_VIEWS: AdminDeliveryAdsHubView[] = [
  "actionable",
  "active",
  "scheduled",
  "held",
  "history",
  "review_unfunded",
  "all",
];

function lifecycleLabelKey(status: string): MessageKey {
  return `admin_delivery_ads_lifecycle_${status.toLowerCase()}` as MessageKey;
}

function hubViewLabelKey(view: AdminDeliveryAdsHubView): MessageKey {
  if (view === "actionable") return "admin_delivery_ads_hub_view_actionable";
  if (view === "history") return "admin_delivery_ads_hub_view_history";
  return `admin_delivery_ads_bucket_${view}` as MessageKey;
}

export function AdminDeliveryAdsControlPlane() {
  const { t, safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const searchParams = useSearchParams();
  const inventoryFilter = searchParams.get("inventory")?.trim() || "";
  const primarySlugFilter =
    searchParams.get("primarySlug")?.trim() || searchParams.get("primary")?.trim() || "";
  const subSlugFilter =
    searchParams.get("subSlug")?.trim() || searchParams.get("sub")?.trim() || "";
  /**
   * R7 목록 표준 8 — 보기(`?view=`)·상품(`?product=`)을 주소에 둔다 (기존 `?view=` 딥링크 호환).
   * 기본값(보기 ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW · 상품 전체)은 주소에서 생략된다.
   */
  const lq = useAdminListQuery<"view" | "product">({
    extras: ["view", "product"],
    extraDefaults: { view: ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW, product: "all" },
  });
  const hubView: AdminDeliveryAdsHubView = (HUB_VIEWS as readonly string[]).includes(lq.query.extras.view)
    ? (lq.query.extras.view as AdminDeliveryAdsHubView)
    : ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW;
  const product: ProductFilter = (PRODUCT_FILTERS as readonly string[]).includes(lq.query.extras.product)
    ? (lq.query.extras.product as ProductFilter)
    : "all";
  const listFiltered = hubView !== ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW || product !== "all";
  const selectHubView = (view: AdminDeliveryAdsHubView) => lq.setExtra("view", view);
  const setProduct = (p: ProductFilter) => lq.setExtra("product", p);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [campaigns, setCampaigns] = useState<AdminDeliveryAdListItem[]>([]);
  /** R7 서버 페이지 — 보기·상품·노출 위치 조건 전체 건수 (DB count). */
  const [total, setTotal] = useState(0);
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
  /** v4 UI-12 — 성과 조회 실패 = 오류 상태 (빈 「집계 없음」으로 보이지 않게) */
  const [perfError, setPerfError] = useState<{ code: string; status?: number } | null>(null);
  const [perfReloadKey, setPerfReloadKey] = useState(0);
  /** 오늘 요약 — 서버가 전체 기준으로 집계 (`admin_delivery_ad_campaigns_page.today_counts` = aggregateAdminHubTodayCounts 규칙). */
  const [todayCounts, setTodayCounts] = useState<AdminHubTodayCounts>(emptyAdminHubTodayCounts);
  const { page, size } = lq.query;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorStatus(undefined);
    try {
      // R7 — 보기 필터·정렬·페이지·전체 건수는 서버(DB) 한 번. 브라우저에서 다시 거르지 않는다.
      const qs = new URLSearchParams({
        view: hubView,
        product,
        limit: String(size),
        offset: String((page - 1) * size),
      });
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
        total?: number;
        summary?: typeof summary;
        policyCounts?: PolicyCampaignCounts | null;
        todayCounts?: AdminHubTodayCounts | null;
      };
      if (!res.ok || !json.ok) {
        // 실패해도 이전 정상 목록은 지우지 않는다 (지시서 §8-5).
        setError(json.error || "load_failed");
        setErrorStatus(res.status);
        return;
      }
      setCampaigns(json.campaigns ?? []);
      setTotal(typeof json.total === "number" && json.total >= 0 ? json.total : 0);
      setPolicyCounts(json.policyCounts ?? null);
      if (json.summary) setSummary(json.summary);
      if (json.todayCounts) setTodayCounts(json.todayCounts);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
    // lq.refreshKey — 같은 조건으로 다시 불러오기(빈 목록 [초기화] 가 같은 주소일 때 포함).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubView, product, page, size, inventoryFilter, primarySlugFilter, subSlugFilter, lq.refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hubView === "actionable") {
      setPerformance(null);
      setPerfLoading(false);
      return;
    }
    let cancelled = false;
    setPerfLoading(true);
    setPerfError(null);
    void fetch(
      `/api/admin/delivery-ads/performance?scope=all&range=${encodeURIComponent(perfRange)}`,
      { credentials: "include", cache: "no-store" }
    )
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          performance?: DeliveryAdPerformancePayload;
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.performance) setPerformance(json.performance);
        else if (res.ok && json.ok) setPerformance(null);
        else {
          setPerformance(null);
          setPerfError({ code: json.error || "load_failed", status: res.status });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPerformance(null);
          setPerfError({ code: "network_error" });
        }
      })
      .finally(() => {
        if (!cancelled) setPerfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [perfRange, hubView, perfReloadKey]);

  const visibleCampaigns = campaigns;

  return (
    <AdminDeliveryCmsChrome help="home">
      <div
        className="space-y-4 pb-10"
        data-admin-delivery-ads-hub="design-board"
        data-hub-default-view="actionable"
        data-admin-delivery-ads-dual-stack="removed"
      >
        {/* 1 — Page identity / summary (Control Plane is /admin/delivery-ads only — no dual mount) */}
        <div data-admin-delivery-ads-section="identity">
          <p className="text-[12px] text-sam-muted">
            {lang === "en" ? "Ads / Exposure › Delivery ads legacy view" : "광고 / 노출 › 배달 광고 기존 화면"}
          </p>
          <AdminPageHeader
            titleKey="admin_menu_delivery_ads_ops"
            description={safeT("admin_delivery_ads_subtitle", {
              fallbackKo: "기존 배달 광고 화면입니다. 통합 신청/운영/위치 관리는 광고 / 노출 authority에서 처리합니다.",
              fallbackEn: "Legacy delivery ads view. Unified application, operation, and placement work is handled by Ads / Exposure authority.",
            })}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/admin/advertising/applications"
              className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
            >
              {lang === "en" ? "Applications" : "광고 신청"}
            </Link>
            <Link
              href="/admin/advertising/operations"
              className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
            >
              {lang === "en" ? "Operations" : "노출 관리"}
            </Link>
            <Link
              href="/admin/advertising/placements"
              className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
            >
              {lang === "en" ? "Placements" : "광고 위치"}
            </Link>
          </div>
          <div className="mt-2">
            <Suspense fallback={null}>
              <AdminOpsCrossLinkBar
                links={[
                  {
                    href: ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
                    labelKo: "커뮤니티 홍보 관리",
                    labelEn: "Community promotion queue",
                    dataAttr: "ads-hub-to-community-promo",
                  },
                ]}
                noteKo="커뮤니티 내 포인트 홍보입니다. Feed Ads·배달 광고 집행과는 별도입니다."
                noteEn="Community Point-based promotion. Separate from Feed Ads and Delivery ad execution."
              />
            </Suspense>
          </div>
          <AdminDeliveryAdsSectionNav />
          {inventoryFilter ? (
            <p className="mt-2 text-[12px] text-sam-fg">
              {t("admin_delivery_ads_filter_inventory")}:{" "}
              {adminDeliveryAdInventoryHumanLabel(inventoryFilter, lang)}
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

        <DeliveryAdAdminTodaySummary counts={todayCounts} />

        {/* 2 — Action Queue ahead of passive browsing */}
        <div id="action-required" className="scroll-mt-16" data-admin-delivery-ads-section="action-queue">
          <AdminDeliveryAdActionQueuePanel />
        </div>

        {/* 3 — Legacy delivery execution list. Unified operations live under /admin/advertising/operations. */}
        <div data-admin-delivery-ads-section="execution-list" data-admin-delivery-ads-section-legacy="campaign-list">
          <h2 className="mb-2 text-[14px] font-semibold text-sam-fg">
            {safeT("admin_delivery_ads_execution_list_title", {
              fallbackKo: "배달 광고 기존 목록",
              fallbackEn: "Legacy delivery ads list",
            })}
          </h2>

          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("admin_delivery_ads_title")}
            data-admin-delivery-ads-hub-views="1"
          >
            {HUB_VIEWS.map((view) => {
              const isHistory = view === "history" || view === "all" || view === "review_unfunded";
              return (
                <AdminChipButton
                  key={view}
                  selected={hubView === view}
                  data-hub-view={view}
                  className={isHistory && hubView !== view ? "opacity-80" : ""}
                  onClick={() => selectHubView(view)}
                >
                  {safeT(hubViewLabelKey(view), {
                    fallbackKo: view,
                    fallbackEn: view,
                  })}
                </AdminChipButton>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {(["all", "store_sponsored", "banner"] as const).map((p) => (
              <AdminChipButton key={p} selected={product === p} onClick={() => setProduct(p)}>
                {safeT(
                  p === "all"
                    ? "admin_delivery_ads_product_all"
                    : adminDeliveryAdProductLabelKey(p),
                  { fallbackKo: p, fallbackEn: p }
                )}
              </AdminChipButton>
            ))}
          </div>

          {loading ? (
            <div className="mt-3">
              <AdminLoadingState
                ko={lang !== "en"}
                label={safeT("admin_delivery_ads_loading", {
                  fallbackKo: "불러오는 중…",
                  fallbackEn: "Loading…",
                })}
              />
            </div>
          ) : null}

          {error ? (
            <div className="mt-3">
              <AdminErrorState ko={lang !== "en"} code={error} httpStatus={errorStatus} onRetry={() => void load()} />
            </div>
          ) : null}

          {!loading && !error && visibleCampaigns.length === 0 ? (
            <div className="mt-3">
              <AdminEmptyState
                ko={lang !== "en"}
                message={safeT("admin_delivery_ads_empty", {
                  fallbackKo: "해당 조건의 광고가 없습니다.",
                  fallbackEn: "No campaigns for this filter.",
                })}
                onReset={listFiltered ? lq.reset : undefined}
              />
            </div>
          ) : null}

          <ul className="mt-3 space-y-2" data-admin-delivery-ads-campaign-rows="1">
            {visibleCampaigns.map((c) => {
              const cta = adminDeliveryAdHubRowPrimaryCta({
                campaignId: c.id,
                productKind: c.productKind,
                lifecycleStatus: c.lifecycleStatus,
                listBucket: c.listBucket,
                creativeAssetPath: c.productKind === "banner" ? c.imageUrl : null,
              });
              const placement =
                c.inventoryKeys
                  .map((k) => adminDeliveryAdInventoryHumanLabel(k, lang))
                  .join(" · ") || "—";
              const bannerCreativeState =
                c.productKind === "banner"
                  ? creativeReady(c.imageUrl)
                    ? "ready"
                    : "needed"
                  : null;
              return (
                <li key={`${c.productKind}:${c.id}`} data-admin-delivery-ads-campaign-row="1">
                  <div className="flex gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                    <Link
                      href={cta.href}
                      className="relative h-14 w-20 shrink-0 overflow-hidden rounded-ui-rect bg-sam-app"
                    >
                      {c.productKind === "banner" && c.imageUrl && creativeReady(c.imageUrl) ? (
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
                        <span className="flex h-full items-center justify-center text-[12px] text-sam-muted">
                          —
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[12px] font-medium text-sam-fg">
                          {safeT(adminDeliveryAdProductLabelKey(c.productKind), {
                            fallbackKo: c.productKind,
                            fallbackEn: c.productKind,
                          })}
                        </span>
                        <span
                          className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[12px] font-medium text-sam-muted"
                          data-campaign-source={c.campaignSource}
                        >
                          {safeT(adminDeliveryAdCampaignSourceLabelKey(c.campaignSource), {
                            fallbackKo:
                              c.campaignSource === "DIBAY_FIRST_PARTY"
                                ? "디바이 광고"
                                : "광고주 광고",
                            fallbackEn:
                              c.campaignSource === "DIBAY_FIRST_PARTY"
                                ? "DIBAY ad"
                                : "Advertiser ad",
                          })}
                        </span>
                        <span className="text-[12px] font-medium text-sam-fg">
                          {safeT(lifecycleLabelKey(c.lifecycleStatus), {
                            fallbackKo: c.lifecycleStatus,
                            fallbackEn: c.lifecycleStatus,
                          })}
                        </span>
                        {bannerCreativeState === "needed" ? (
                          <span className="text-[12px] font-medium text-sam-warning">
                            {safeT("admin_delivery_ads_banner_creative_state_needed", {
                              fallbackKo: "제작 필요",
                              fallbackEn: "Needs production",
                            })}
                          </span>
                        ) : bannerCreativeState === "ready" ? (
                          <span className="text-[12px] text-sam-muted">
                            {safeT("admin_delivery_ads_banner_creative_state_ready", {
                              fallbackKo: "제작 완료",
                              fallbackEn: "Ready",
                            })}
                          </span>
                        ) : null}
                        {c.scheduleHint === "ended" && c.lifecycleStatus === "ACTIVE" ? (
                          <span className="text-[12px] text-sam-warning">
                            {safeT("admin_delivery_ads_schedule_ended_hint", {
                              fallbackKo: "일정 종료(표시)",
                              fallbackEn: "Schedule ended (display)",
                            })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-sam-fg">
                        {c.storeName ||
                          adminDisplayApplicantLabel(c.title || "", lang !== "en") ||
                          "—"}
                      </p>
                      <p className="truncate text-[12px] text-sam-muted">
                        {placement}
                        {c.pricingModel
                          ? ` · ${c.pricingModel}`
                          : ` · ${safeT("admin_delivery_ads_hub_price_unset", {
                              fallbackKo: "가격 미설정",
                              fallbackEn: "Price not set",
                            })}`}
                        {` · ${formatAdminManilaDateTime(c.updatedAt)}`}
                      </p>
                      <div className="mt-2">
                        <AdminActionLink
                          href={cta.href}
                          variant="secondary"
                          size="sm"
                          data-admin-delivery-ads-row-cta="1"
                          data-cta-focus={cta.focus ?? ""}
                        >
                          {safeT(cta.labelKey, {
                            fallbackKo: "상세",
                            fallbackEn: "Detail",
                          })}
                        </AdminActionLink>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {!error && (total > 0 || page > 1) ? (
            <AdminPagination
              ko={lang !== "en"}
              page={page}
              size={size}
              total={total}
              disabled={loading}
              onPageChange={lq.setPage}
              onSizeChange={lq.setSize}
            />
          ) : null}
        </div>

        {/* 4 — Secondary tools (performance) — not on actionable landing */}
        {hubView !== "actionable" ? (
          <div data-admin-delivery-ads-section="secondary">
            <AdminCard titleKey="delivery_ads_perf_section_title">
              {perfError && !perfLoading ? (
                <AdminErrorState
                  ko={lang !== "en"}
                  code={perfError.code}
                  httpStatus={perfError.status}
                  onRetry={() => setPerfReloadKey((k) => k + 1)}
                />
              ) : (
                <DeliveryAdPerformancePanel
                  performance={performance}
                  loading={perfLoading}
                  range={perfRange}
                  onRangeChange={setPerfRange}
                />
              )}
            </AdminCard>
          </div>
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
