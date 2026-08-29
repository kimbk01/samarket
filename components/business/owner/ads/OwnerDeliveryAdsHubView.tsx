"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  ownerInventoryI18nKey,
  ownerLifecycleStatusI18nKey,
  type OwnerStoreSponsoredInventoryKey,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { OwnerMobileStackedLabelCount } from "@/components/business/owner/OwnerMobileStackedLabelCount";
import { Sam } from "@/lib/ui/css-vars";

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
  productKind?: "store_sponsored" | "banner";
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
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setLoaded(true);
        return;
      }
      setCampaigns(json.campaigns ?? []);
      setStores(json.stores ?? []);
      if (json.summary) setSummary(json.summary);
    } catch {
      setError("network");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.storeName);
    return m;
  }, [stores]);

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
    <div className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pb-8 pt-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_delivery_ads_hub_title")}</h1>
          <p className="mt-1 text-[13px] text-sam-muted">{t("owner_delivery_ads_hub_desc")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Link
            href={DELIVERY_AD_OWNER_ROUTES.createStoreSponsored}
            className={`${Sam.btn.secondary} px-3 py-2 text-[13px] font-semibold`}
          >
            {t("owner_ads_create_store_sponsored_cta")}
          </Link>
          <Link
            href={DELIVERY_AD_OWNER_ROUTES.createBanner}
            className={`${Sam.btn.primary} px-3 py-2 text-[13px] font-semibold`}
          >
            {t("owner_ads_create_banner_cta")}
          </Link>
        </div>
      </div>

      <OwnerStoreAdminDashSection title={t("owner_delivery_ads_hub_title")}>
        <div className="grid grid-cols-5 gap-1">
          {summaryItems.map((item) => (
            <div
              key={item.key}
              className="rounded-ui-rect border border-sam-border bg-sam-app px-1 py-2 text-center"
            >
              <OwnerMobileStackedLabelCount
                variant="kpi"
                label={t(item.labelKey)}
                count={item.count}
              />
            </div>
          ))}
        </div>
      </OwnerStoreAdminDashSection>

      {!loaded ? (
        <p className="text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
      ) : error ? (
        <p className="text-[13px] text-red-600" role="alert">
          {safeT("owner_ads_error_generic", {
            fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Something went wrong. Please try again.",
          })}
        </p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-6 text-center">
          <p className="text-[15px] font-semibold text-sam-fg">{t("owner_ads_empty_title")}</p>
          <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_empty_body")}</p>
          <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Link
              href={DELIVERY_AD_OWNER_ROUTES.createStoreSponsored}
              className={`${Sam.btn.secondary} inline-flex px-4 py-2 text-[14px] font-semibold`}
            >
              {t("owner_ads_create_store_sponsored_cta")}
            </Link>
            <Link
              href={DELIVERY_AD_OWNER_ROUTES.createBanner}
              className={`${Sam.btn.primary} inline-flex px-4 py-2 text-[14px] font-semibold`}
            >
              {t("owner_ads_create_banner_cta")}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => {
            const isBanner = c.productKind === "banner";
            const invLabels = isBanner
              ? t("owner_ads_inventory_home_hero")
              : ((c.inventoryKeys ?? []) as OwnerStoreSponsoredInventoryKey[])
                  .map((k) => t(ownerInventoryI18nKey(k)))
                  .join(" · ");
            return (
              <li key={c.id}>
                <Link
                  href={
                    DELIVERY_AD_OWNER_ROUTES.detail(c.id) +
                    `?storeId=${encodeURIComponent(c.storeId)}${isBanner ? "&product=banner" : ""}`
                  }
                  className="block rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-sam-fg">
                        {storeNameById.get(c.storeId) ?? c.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-sam-muted">
                        {isBanner
                          ? t("owner_ads_product_banner")
                          : t("owner_ads_product_store_sponsored")}
                        {invLabels ? ` · ${invLabels}` : ""}
                      </p>
                      <p className="mt-1 text-[12px] text-sam-muted">
                        {t("owner_ads_period")}: {c.startAt.slice(0, 10)} ~ {c.endAt.slice(0, 10)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-ui-rect bg-sam-app px-2 py-1 text-[11px] font-medium text-sam-fg">
                      {t(ownerLifecycleStatusI18nKey(c.lifecycleStatus))}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
