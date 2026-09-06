"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  adminDeliveryAdsHubApiBucket,
  adminDeliveryAdHubRowPrimaryCta,
  adminDeliveryAdInventoryHumanLabel,
  adminDeliveryAdProductLabelKey,
  adminDeliveryAdCampaignSourceLabelKey,
  isAdminDeliveryAdHubListItemVisible,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { aggregateAdminHubTodayCounts } from "@/lib/stores/advertising/delivery-ad-admin-hub-today-counts";
import type { DeliveryAdAdminActionQueueItem } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { isDeliveryBannerCreativeAssetReady as creativeReady } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { ARO_IA_001_COMMUNITY_PROMOTIONS_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { adminDisplayApplicantLabel } from "@/lib/admin/operator-ux/operator-labels";

type ProductFilter = "all" | "store_sponsored" | "banner";

const HUB_VIEWS: AdminDeliveryAdsHubView[] = [
  "actionable",
  "active",
  "scheduled",
  "held",
  "history",
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
  const router = useRouter();
  const inventoryFilter = searchParams.get("inventory")?.trim() || "";
  const primarySlugFilter =
    searchParams.get("primarySlug")?.trim() || searchParams.get("primary")?.trim() || "";
  const subSlugFilter =
    searchParams.get("subSlug")?.trim() || searchParams.get("sub")?.trim() || "";
  const [hubView, setHubView] = useState<AdminDeliveryAdsHubView>(() => {
    const v = searchParams.get("view")?.trim();
    if (v && (HUB_VIEWS as readonly string[]).includes(v)) {
      return v as AdminDeliveryAdsHubView;
    }
    return ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW;
  });

  useEffect(() => {
    const v = searchParams.get("view")?.trim();
    if (v && (HUB_VIEWS as readonly string[]).includes(v)) {
      setHubView(v as AdminDeliveryAdsHubView);
    }
  }, [searchParams]);

  const selectHubView = (view: AdminDeliveryAdsHubView) => {
    setHubView(view);
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", view);
    router.replace(`${DELIVERY_AD_ADMIN_ROUTES.hub}?${next.toString()}`, { scroll: false });
  };
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
  const [allCampaigns, setAllCampaigns] = useState<AdminDeliveryAdListItem[]>([]);
  const [actionQueueItems, setActionQueueItems] = useState<DeliveryAdAdminActionQueueItem[]>([]);

  const apiBucket = adminDeliveryAdsHubApiBucket(hubView);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ bucket: apiBucket, product });
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
  }, [apiBucket, product, inventoryFilter, primarySlugFilter, subSlugFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [campRes, queueRes] = await Promise.all([
          fetch("/api/admin/delivery-ads?bucket=all&product=all&limit=500", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/admin/delivery-ads/action-queue?limit=100", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        const campJson = (await campRes.json()) as { ok?: boolean; campaigns?: AdminDeliveryAdListItem[] };
        const queueJson = (await queueRes.json()) as {
          ok?: boolean;
          items?: DeliveryAdAdminActionQueueItem[];
        };
        if (cancelled) return;
        if (campRes.ok && campJson.ok) setAllCampaigns(campJson.campaigns ?? []);
        if (queueRes.ok && queueJson.ok) setActionQueueItems(queueJson.items ?? []);
      } catch {
        if (!cancelled) {
          setAllCampaigns([]);
          setActionQueueItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (hubView === "actionable") {
      setPerformance(null);
      setPerfLoading(false);
      return;
    }
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
  }, [perfRange, hubView]);

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter((c) =>
        isAdminDeliveryAdHubListItemVisible({
          view: hubView,
          listBucket: c.listBucket,
        })
      ),
    [campaigns, hubView]
  );

  const todaySummaryCounts = useMemo(
    () =>
      aggregateAdminHubTodayCounts({
        campaigns: allCampaigns,
        actionQueueItems,
      }),
    [allCampaigns, actionQueueItems]
  );

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
            {lang === "en" ? "Ads / Exposure › Delivery ops" : "광고 / 노출 › 배달 운영"}
          </p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_title", {
              fallbackKo: "배달 광고 목록",
              fallbackEn: "Delivery ads list",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_subtitle", {
              fallbackKo: "매장 홍보·배달 배너 신청·집행·이력 (단일 운영 경로)",
              fallbackEn: "Store promotion & delivery banner — single ops path",
            })}
          </p>
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

        <DeliveryAdAdminTodaySummary counts={todaySummaryCounts} />

        {/* 2 — Action Queue ahead of passive browsing */}
        <div data-admin-delivery-ads-section="action-queue">
          <AdminDeliveryAdActionQueuePanel />
        </div>

        {/* 3 — Ad execution list (actionable-first). UI term: 집행 — not generic Campaign. */}
        <div data-admin-delivery-ads-section="execution-list" data-admin-delivery-ads-section-legacy="campaign-list">
          <h2 className="mb-2 text-[14px] font-semibold text-sam-fg">
            {safeT("admin_delivery_ads_execution_list_title", {
              fallbackKo: "광고 집행 목록",
              fallbackEn: "Ad executions",
            })}
          </h2>

          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label={t("admin_delivery_ads_title")}
            data-admin-delivery-ads-hub-views="1"
          >
            {HUB_VIEWS.map((view) => {
              const isHistory = view === "history" || view === "all";
              return (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={hubView === view}
                  data-hub-view={view}
                  className={`inline-flex min-h-[40px] items-center rounded-ui-rect border px-3 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] ${
                    hubView === view
                      ? "border-[#0A823E] bg-[#0A823E] text-white"
                      : isHistory
                        ? "border-sam-border/60 bg-sam-app text-sam-muted hover:border-[#0A823E]/40"
                        : "border-sam-border bg-sam-surface text-sam-fg hover:border-[#0A823E]/50 hover:bg-[#0A823E]/5"
                  }`}
                  onClick={() => selectHubView(view)}
                >
                  {safeT(hubViewLabelKey(view), {
                    fallbackKo: view,
                    fallbackEn: view,
                  })}
                </button>
              );
            })}
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
                {safeT(
                  p === "all"
                    ? "admin_delivery_ads_product_all"
                    : adminDeliveryAdProductLabelKey(p),
                  { fallbackKo: p, fallbackEn: p }
                )}
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
              })}
            </p>
          ) : null}

          {!loading && !error && visibleCampaigns.length === 0 ? (
            <p className="mt-3 text-[13px] text-sam-muted">
              {safeT("admin_delivery_ads_empty", {
                fallbackKo: "해당 조건의 광고가 없습니다.",
                fallbackEn: "No campaigns for this filter.",
              })}
            </p>
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
                        <span className="flex h-full items-center justify-center text-[10px] text-sam-muted">
                          —
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[10px] font-medium text-sam-fg">
                          {safeT(adminDeliveryAdProductLabelKey(c.productKind), {
                            fallbackKo: c.productKind,
                            fallbackEn: c.productKind,
                          })}
                        </span>
                        <span
                          className="rounded-sm bg-sam-app px-1.5 py-0.5 text-[10px] font-medium text-sam-muted"
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
                          <span className="text-[11px] font-medium text-sam-warning">
                            {safeT("admin_delivery_ads_banner_creative_state_needed", {
                              fallbackKo: "제작 필요",
                              fallbackEn: "Needs production",
                            })}
                          </span>
                        ) : bannerCreativeState === "ready" ? (
                          <span className="text-[11px] text-sam-muted">
                            {safeT("admin_delivery_ads_banner_creative_state_ready", {
                              fallbackKo: "제작 완료",
                              fallbackEn: "Ready",
                            })}
                          </span>
                        ) : null}
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
                        {c.storeName ||
                          adminDisplayApplicantLabel(c.title || "", lang !== "en") ||
                          "—"}
                      </p>
                      <p className="truncate text-[11px] text-sam-muted">
                        {placement}
                        {c.pricingModel
                          ? ` · ${c.pricingModel}`
                          : ` · ${safeT("admin_delivery_ads_hub_price_unset", {
                              fallbackKo: "가격 미설정",
                              fallbackEn: "Price not set",
                            })}`}
                        {` · ${new Date(c.updatedAt).toLocaleString(lang === "en" ? "en" : "ko")}`}
                      </p>
                      <div className="mt-2">
                        <Link
                          href={cta.href}
                          className="inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
                          data-admin-delivery-ads-row-cta="1"
                          data-cta-focus={cta.focus ?? ""}
                        >
                          {safeT(cta.labelKey, {
                            fallbackKo: "검토하기",
                            fallbackEn: "Review",
                          })}
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 4 — Secondary tools (performance) — not on actionable landing */}
        {hubView !== "actionable" ? (
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
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
