"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import type { DeliveryAdOwnerProductKind } from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import { ownerLifecycleStatusI18nKey } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { OwnerMobileStackedLabelCount } from "@/components/business/owner/OwnerMobileStackedLabelCount";
import { Sam } from "@/lib/ui/css-vars";
import type { MessageKey } from "@/lib/i18n/messages";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { ownerAdsHubCardPrimaryCta } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";
import { decodeOwnerAdPackagePricingModel } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

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
  pricingModel?: string | null;
  updatedAt?: string;
};

type HubSummary = {
  changes_requested: number;
  under_review: number;
  scheduled: number;
  active: number;
  paused: number;
  ended: number;
  draft: number;
};

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
    changes_requested: 0,
    under_review: 0,
    scheduled: 0,
    active: 0,
    paused: 0,
    ended: 0,
    draft: 0,
  });
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
        businessCash?: { balanceMinor?: number };
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setLoaded(true);
        return;
      }
      setCampaigns(json.campaigns ?? []);
      setStores(json.stores ?? []);
      if (json.summary) {
        setSummary({
          changes_requested: json.summary.changes_requested ?? 0,
          under_review: json.summary.under_review ?? 0,
          scheduled: json.summary.scheduled ?? 0,
          active: json.summary.active ?? 0,
          paused: json.summary.paused ?? 0,
          ended: json.summary.ended ?? 0,
          draft: json.summary.draft ?? 0,
        });
      }
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
    key: keyof HubSummary;
    labelKey: MessageKey;
    count: number;
  }> = [
    {
      key: "changes_requested",
      labelKey: "owner_ads_summary_changes_requested",
      count: summary.changes_requested,
    },
    {
      key: "under_review",
      labelKey: "owner_ads_summary_under_review",
      count: summary.under_review,
    },
    { key: "scheduled", labelKey: "owner_ads_summary_scheduled", count: summary.scheduled },
    { key: "active", labelKey: "owner_ads_summary_active", count: summary.active },
    { key: "paused", labelKey: "owner_ads_summary_paused", count: summary.paused },
  ];

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-lg px-4 pb-8 pt-4`}
      data-owner-ads-hub="r1"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_delivery_ads_hub_title")}</h1>
          <p className="mt-1 text-[13px] text-sam-muted">{t("owner_delivery_ads_hub_desc")}</p>
        </div>
        <button
          type="button"
          className={`${Sam.btn.primary} shrink-0 min-h-[44px] px-4 text-[14px] font-semibold`}
          data-owner-ads-primary-cta="apply"
          onClick={() => setProductSelectOpen(true)}
        >
          {t("owner_ads_apply_primary_cta")}
        </button>
      </div>

      {loaded && !error ? (
        <div
          className="grid grid-cols-5 gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-2"
          data-owner-ads-summary-kpi="actionable"
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
        <ul className="space-y-2" data-owner-ads-campaign-list="1">
          {sortedCampaigns.map((c) => {
            const productKind: DeliveryAdOwnerProductKind =
              c.productKind === "banner" ? "banner" : "store_sponsored";
            const invLabels = deliveryAdPlacementI18nKeys(c.inventoryKeys ?? [])
              .map((k) => t(k as MessageKey))
              .join(" · ");
            const hasPackage = Boolean(decodeOwnerAdPackagePricingModel(c.pricingModel));
            const cta = ownerAdsHubCardPrimaryCta({
              lifecycleStatus: c.lifecycleStatus,
              productKind,
              storeId: c.storeId,
              campaignId: c.id,
            });
            return (
              <li key={c.id}>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-sam-muted">
                        {productKind === "banner"
                          ? t("owner_ads_product_banner")
                          : t("owner_ads_product_store_sponsored")}
                      </p>
                      <p className="mt-0.5 truncate text-[15px] font-semibold text-sam-fg">
                        {storeNameById.get(c.storeId) ?? c.title ?? t("owner_ads_store")}
                      </p>
                      {invLabels ? (
                        <p className="mt-1 text-[12px] text-sam-muted">{invLabels}</p>
                      ) : c.lifecycleStatus === "DRAFT" ? null : (
                        <p className="mt-1 text-[12px] text-sam-muted">—</p>
                      )}
                      {c.lifecycleStatus === "DRAFT" && !hasPackage ? (
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {t("owner_ads_price_unset")}
                        </p>
                      ) : (
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {t("owner_ads_period")}: {c.startAt.slice(0, 10)} ~{" "}
                          {c.endAt.slice(0, 10)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-ui-rect bg-sam-app px-2 py-1 text-[11px] font-medium text-sam-fg">
                      {t(ownerLifecycleStatusI18nKey(c.lifecycleStatus))}
                    </span>
                  </div>
                  <Link
                    href={cta.href}
                    className="mt-3 inline-flex min-h-[40px] items-center text-[13px] font-semibold text-signature"
                    data-owner-ads-card-cta={c.lifecycleStatus}
                  >
                    {t(cta.labelKey)}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p
        className="text-center text-[11px] leading-relaxed text-sam-muted"
        data-owner-ads-business-cash="summary"
      >
        {t("owner_ads_business_cash_label")}
        {cashBalanceMinor != null ? ` · ${formatDeliveryAdPhpMinor(cashBalanceMinor)}` : ""}
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
            data-owner-ads-product-card="store_sponsored"
          >
            <p className="text-[15px] font-bold text-sam-fg">
              {t("owner_ads_product_store_sponsored")}
            </p>
            <p className="mt-2 text-[13px] text-sam-muted">
              {t("owner_ads_product_store_sponsored_desc")}
            </p>
            <p className="mt-3 text-[13px] font-semibold text-signature">
              {t("owner_ads_product_select_apply")}
            </p>
          </Link>
          <Link
            href={DELIVERY_AD_OWNER_ROUTES.createBanner}
            className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 transition hover:border-signature"
            onClick={() => setProductSelectOpen(false)}
            data-owner-ads-product-card="banner"
          >
            <p className="text-[15px] font-bold text-sam-fg">{t("owner_ads_product_banner")}</p>
            <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_product_banner_desc")}</p>
            <p className="mt-3 text-[13px] font-semibold text-signature">
              {t("owner_ads_product_select_apply")}
            </p>
          </Link>
        </div>
      </DibayBottomSheet>
    </div>
  );
}
