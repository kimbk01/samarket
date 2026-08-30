"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import {
  ownerDeliveryAdDetailHref,
  ownerDeliveryAdPrimaryNextAction,
  type DeliveryAdOwnerProductKind,
} from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import { ownerLifecycleStatusI18nKey } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { OwnerMobileStackedLabelCount } from "@/components/business/owner/OwnerMobileStackedLabelCount";
import { Sam } from "@/lib/ui/css-vars";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

type HubStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  eligible: boolean;
};

type HubCampaign = {
  id: string;
  storeId: string;
  title?: string | null;
  startAt: string;
  endAt: string;
  lifecycleStatus: OwnerSponsoredCampaignRow["lifecycleStatus"];
  inventoryKeys?: string[];
  productKind?: DeliveryAdOwnerProductKind;
  updatedAt?: string;
};

type HubSummary = {
  under_review: number;
  scheduled: number;
  active: number;
  paused: number;
  ended: number;
  draft: number;
};

/** Actionable first, then draft/ended noise. */
function hubCampaignSortRank(status: HubCampaign["lifecycleStatus"]): number {
  switch (status) {
    case "CHANGES_REQUESTED":
      return 0;
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return 1;
    case "ACTIVE":
      return 2;
    case "PAUSED_OWNER":
    case "PAUSED_ADMIN":
      return 3;
    case "SCHEDULED":
    case "APPROVED":
      return 4;
    case "DRAFT":
      return 8;
    case "ENDED":
    case "TERMINATED":
    case "ARCHIVED":
    case "REJECTED":
    case "EXHAUSTED":
      return 9;
    default:
      return 7;
  }
}

export function OwnerDeliveryAdsHubView() {
  const { t, safeT } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<HubCampaign[]>([]);
  const [stores, setStores] = useState<HubStore[]>([]);
  const [summary, setSummary] = useState<HubSummary>({
    under_review: 0,
    scheduled: 0,
    active: 0,
    paused: 0,
    ended: 0,
    draft: 0,
  });
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [unreadByCampaignId, setUnreadByCampaignId] = useState<Record<string, number>>({});
  const [productSelectOpen, setProductSelectOpen] = useState(false);
  const [cashBalanceMinor, setCashBalanceMinor] = useState<number | null>(null);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(productSelectOpen);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/me/delivery-ads", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: HubCampaign[];
        stores?: HubStore[];
        summary?: HubSummary;
        unreadByCampaignId?: Record<string, number>;
        businessCash?: { balanceMinor?: number };
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setLoaded(true);
        return;
      }
      setCampaigns(json.campaigns ?? []);
      setStores(json.stores ?? []);
      if (json.summary) setSummary(json.summary);
      setUnreadByCampaignId(json.unreadByCampaignId ?? {});
      setCashBalanceMinor(
        typeof json.businessCash?.balanceMinor === "number"
          ? json.businessCash.balanceMinor
          : 0
      );
    } catch {
      setError("network");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setPerfLoading(true);
    void fetch(`/api/me/delivery-ads/performance?range=${encodeURIComponent(perfRange)}`, {
      credentials: "include",
    })
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

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.storeName);
    return m;
  }, [stores]);

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const rank = hubCampaignSortRank(a.lifecycleStatus) - hubCampaignSortRank(b.lifecycleStatus);
      if (rank !== 0) return rank;
      const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTs - aTs;
    });
  }, [campaigns]);

  const summaryItems: Array<{
    key: "under_review" | "scheduled" | "active" | "paused" | "ended";
    labelKey:
      | "owner_ads_summary_under_review"
      | "owner_ads_summary_scheduled"
      | "owner_ads_summary_active"
      | "owner_ads_summary_paused"
      | "owner_ads_summary_ended";
    count: number;
  }> = [
    { key: "under_review", labelKey: "owner_ads_summary_under_review", count: summary.under_review },
    { key: "scheduled", labelKey: "owner_ads_summary_scheduled", count: summary.scheduled },
    { key: "active", labelKey: "owner_ads_summary_active", count: summary.active },
    { key: "paused", labelKey: "owner_ads_summary_paused", count: summary.paused },
    { key: "ended", labelKey: "owner_ads_summary_ended", count: summary.ended },
  ];

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-lg px-4 pb-8 pt-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_delivery_ads_hub_title")}</h1>
          <p className="mt-1 text-[13px] text-sam-muted">{t("owner_delivery_ads_hub_desc")}</p>
        </div>
        <button
          type="button"
          className={`${Sam.btn.primary} shrink-0 min-h-[40px] px-3 text-[13px] font-semibold`}
          data-owner-ads-primary-cta="apply"
          onClick={() => setProductSelectOpen(true)}
        >
          {t("owner_ads_apply_primary_cta")}
        </button>
      </div>

      {!loaded ? (
        <p className="text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
      ) : error ? (
        <p className="text-[13px] text-red-600" role="alert">
          {safeT("owner_ads_error_generic", {
            fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Something went wrong. Please try again.",
          })}
        </p>
      ) : sortedCampaigns.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-6 text-center">
          <p className="text-[15px] font-semibold text-sam-fg">{t("owner_ads_empty_title")}</p>
          <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_empty_body")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedCampaigns.map((c) => {
            const productKind: DeliveryAdOwnerProductKind =
              c.productKind === "banner" ? "banner" : "store_sponsored";
            const invLabels = deliveryAdPlacementI18nKeys(c.inventoryKeys ?? [])
              .map((k) => t(k as MessageKey))
              .join(" · ");
            const next = ownerDeliveryAdPrimaryNextAction({
              lifecycleStatus: c.lifecycleStatus,
              productKind,
              storeId: c.storeId,
              campaignId: c.id,
            });
            return (
              <li key={c.id}>
                <Link
                  href={ownerDeliveryAdDetailHref({
                    campaignId: c.id,
                    storeId: c.storeId,
                    productKind,
                  })}
                  className="block rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-sam-fg">
                        {storeNameById.get(c.storeId) ?? c.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-sam-muted">
                        {productKind === "banner"
                          ? t("owner_ads_product_banner")
                          : t("owner_ads_product_store_sponsored")}
                        {invLabels ? ` · ${invLabels}` : ""}
                      </p>
                      <p className="mt-1 text-[12px] text-sam-muted">
                        {t("owner_ads_period")}: {c.startAt.slice(0, 10)} ~ {c.endAt.slice(0, 10)}
                      </p>
                      {next ? (
                        <p className="mt-1 text-[12px] font-medium text-signature">
                          {t("owner_ads_next_action_label")}: {t(next.labelKey as MessageKey)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-ui-rect bg-sam-app px-2 py-1 text-[11px] font-medium text-sam-fg">
                        {t(ownerLifecycleStatusI18nKey(c.lifecycleStatus))}
                      </span>
                      {(unreadByCampaignId[c.id] ?? 0) > 0 ? (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-sam-brand"
                          title={safeT("delivery_ad_ops_ui_unread_dot", {
                            fallbackKo: "새 운영 알림",
                            fallbackEn: "New operations update",
                          })}
                          aria-label={safeT("delivery_ad_ops_ui_unread_dot", {
                            fallbackKo: "새 운영 알림",
                            fallbackEn: "New operations update",
                          })}
                        />
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {loaded && !error ? (
        <div
          className="grid grid-cols-5 gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-2"
          data-owner-ads-summary-kpi="secondary"
        >
          {summaryItems.map((item) => (
            <div key={item.key} className="px-0.5 py-1 text-center">
              <OwnerMobileStackedLabelCount
                variant="kpi"
                label={t(item.labelKey)}
                count={item.count}
              />
            </div>
          ))}
        </div>
      ) : null}

      <OwnerStoreAdminDashSection title={t("delivery_ads_perf_section_title")}>
        <DeliveryAdPerformancePanel
          performance={performance}
          loading={perfLoading}
          range={perfRange}
          onRangeChange={setPerfRange}
        />
      </OwnerStoreAdminDashSection>

      <p
        className="text-center text-[11px] leading-relaxed text-sam-muted"
        data-owner-ads-business-cash="summary"
      >
        {t("owner_ads_business_cash_label")}
        {cashBalanceMinor != null
          ? ` · ${formatDeliveryAdPhpMinor(cashBalanceMinor)}`
          : ""}
        <br />
        {t("owner_ads_business_cash_topup_unavailable")}
      </p>

      <DibayBottomSheet
        open={productSelectOpen}
        onClose={() => setProductSelectOpen(false)}
        title={t("owner_ads_product_select_title")}
        anchor="above-bottom-nav"
        ariaLabel={t("owner_ads_product_select_title")}
        panelClassName="!max-w-md"
        contentPaddingBottomPx={contentPaddingBottomPx}
      >
        <div className="mt-3 space-y-3" data-owner-ads-product-select="1">
          <Link
            href={DELIVERY_AD_OWNER_ROUTES.createStoreSponsored}
            className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 transition hover:border-signature"
            onClick={() => setProductSelectOpen(false)}
          >
            <p className="text-[15px] font-bold text-sam-fg">
              {t("owner_ads_product_store_sponsored")}
            </p>
            <p className="mt-2 text-[13px] text-sam-muted">
              {t("owner_ads_product_store_sponsored_desc")}
            </p>
            <p className="mt-2 text-[12px] text-sam-fg">
              {t("owner_ads_product_store_sponsored_shape")}
            </p>
            <p className="mt-1 text-[12px] text-sam-muted">
              {t("owner_ads_product_store_sponsored_placements")}
            </p>
          </Link>
          <Link
            href={DELIVERY_AD_OWNER_ROUTES.createBanner}
            className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 transition hover:border-signature"
            onClick={() => setProductSelectOpen(false)}
          >
            <p className="text-[15px] font-bold text-sam-fg">{t("owner_ads_product_banner")}</p>
            <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_product_banner_desc")}</p>
            <p className="mt-2 text-[12px] text-sam-fg">{t("owner_ads_product_banner_shape")}</p>
            <p className="mt-1 text-[12px] text-sam-muted">
              {t("owner_ads_product_banner_placements")}
            </p>
          </Link>
        </div>
      </DibayBottomSheet>
    </div>
  );
}
