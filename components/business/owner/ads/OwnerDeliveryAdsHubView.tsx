"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import type { DeliveryAdOwnerProductKind } from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { ownerAdsHubCardPrimaryCta } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";
import { DELIVERY_AD_OWNER_HUB_KPI_BUCKETS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { DeliveryAdOwnerStatusBadge } from "@/components/stores/advertising/DeliveryAdOwnerStatusBadge";
import { DeliveryAdOwnerProductSelectCard } from "@/components/stores/advertising/DeliveryAdOwnerProductSelectCard";
import type { OwnerAdsSummaryBucket } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { MessageKey } from "@/lib/i18n/messages";

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
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/profile", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { profile?: { nickname?: string | null } } | null) => {
        if (cancelled || !json?.profile) return;
        const nick = String(json.profile.nickname ?? "").trim();
        if (nick) setOwnerDisplayName(nick);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    key: OwnerAdsSummaryBucket;
    labelKey: MessageKey;
    count: number;
  }> = DELIVERY_AD_OWNER_HUB_KPI_BUCKETS.map((key) => ({
    key,
    labelKey: `owner_ads_summary_${key}` as MessageKey,
    count: summary[key],
  }));

  const greetingText = ownerDisplayName
    ? t("owner_ads_hub_greeting").replace("{name}", ownerDisplayName)
    : t("owner_ads_hub_greeting_fallback");

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-lg px-4 pb-8 pt-4`}
      data-owner-ads-hub="design-board"
    >
      <div className="min-w-0">
        <p className="text-[13px] text-sam-muted" data-owner-ads-hub-greeting="1">
          {greetingText}
        </p>
        <h1 className="mt-0.5 text-[20px] font-bold text-sam-fg">
          {t("owner_delivery_ads_hub_title")}
        </h1>
        <p className="mt-1 text-[13px] text-sam-muted">{t("owner_delivery_ads_hub_desc")}</p>
      </div>

      {loaded && !error ? (
        <>
        <div
          className="grid grid-cols-4 gap-1 rounded-ui-rect border border-[#BDBDBD] bg-white p-3 shadow-sm"
          data-owner-ads-summary-kpi="design-board"
        >
          {summaryItems.map((item) => (
            <div key={item.key} className="px-0.5 py-1 text-center">
              <p className="text-[18px] font-bold tabular-nums text-[#0A823E]">{item.count}</p>
              <p className="mt-0.5 text-[11px] font-medium text-sam-muted">{t(item.labelKey)}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} w-full`}
          data-owner-ads-primary-cta="apply"
          onClick={() => setProductSelectOpen(true)}
        >
          {t("owner_ads_apply_primary_cta")}
        </button>
        </>
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
      ) : (
        <>
          {sortedCampaigns.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-[#BDBDBD] bg-[#F5F5F5] p-6 text-center">
              <p className="text-[15px] font-semibold text-sam-fg">{t("owner_ads_empty_title")}</p>
              <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_empty_body")}</p>
            </div>
          ) : (
            <>
              <h2 className="text-[15px] font-bold text-sam-fg" data-owner-ads-recent-title="1">
                {t("owner_ads_hub_recent_ads")}
              </h2>
              <ul className="space-y-2" data-owner-ads-campaign-list="1">
              {sortedCampaigns.map((c) => {
                const productKind: DeliveryAdOwnerProductKind =
                  c.productKind === "banner" ? "banner" : "store_sponsored";
                const invLabels = deliveryAdPlacementI18nKeys(c.inventoryKeys ?? [])
                  .map((k) => t(k as MessageKey))
                  .join(" · ");
                const cta = ownerAdsHubCardPrimaryCta({
                  lifecycleStatus: c.lifecycleStatus,
                  productKind,
                  storeId: c.storeId,
                  campaignId: c.id,
                });
                const productLabel =
                  productKind === "banner"
                    ? t("owner_ads_product_banner")
                    : t("owner_ads_product_store_sponsored");
                const firstPlacement = invLabels.split(" · ")[0]?.trim() || "—";
                const cardTitle = `${productLabel} - ${firstPlacement}`;
                return (
                  <li key={c.id}>
                    <div className="rounded-ui-rect border border-[#BDBDBD] bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="truncate text-[15px] font-semibold text-sam-fg"
                            data-owner-ads-hub-card-title="design-board"
                          >
                            {cardTitle}
                          </p>
                          <p className="mt-1 text-[12px] text-[#757575]">
                            {c.startAt.slice(0, 10)} ~ {c.endAt.slice(0, 10)}
                          </p>
                        </div>
                        <DeliveryAdOwnerStatusBadge status={c.lifecycleStatus} />
                      </div>
                      <Link
                        href={cta.href}
                        className="mt-3 inline-flex min-h-[40px] items-center text-[13px] font-semibold text-[#0A823E]"
                        data-owner-ads-card-cta={c.lifecycleStatus}
                      >
                        {t(cta.labelKey)}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}

          <Link
            href={
              stores[0]
                ? `${DELIVERY_AD_OWNER_ROUTES.partner}?storeId=${encodeURIComponent(stores[0].id)}`
                : DELIVERY_AD_OWNER_ROUTES.partner
            }
            className="block rounded-ui-rect border border-[#BDBDBD] bg-white p-4"
            data-owner-ads-partner-card="1"
          >
            <p className="text-[15px] font-bold text-sam-fg">{t("owner_ads_partner_card_title")}</p>
            <p className="mt-1 text-[13px] text-sam-muted">{t("owner_ads_partner_card_desc")}</p>
            <p className="mt-3 text-[13px] font-semibold text-[#0A823E]">
              {t("owner_ads_partner_card_cta")}
            </p>
          </Link>
        </>
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
        <div className="mt-3 space-y-3" data-owner-ads-product-select="design-board">
          <DeliveryAdOwnerProductSelectCard
            href={DELIVERY_AD_OWNER_ROUTES.createStoreSponsored}
            productKind="store_sponsored"
            title={t("owner_ads_product_store_sponsored")}
            description={t("owner_ads_product_store_sponsored_desc")}
            ctaLabel={t("owner_ads_product_select_apply")}
            onNavigate={() => setProductSelectOpen(false)}
          />
          <DeliveryAdOwnerProductSelectCard
            href={DELIVERY_AD_OWNER_ROUTES.createBanner}
            productKind="banner"
            title={t("owner_ads_product_banner")}
            description={t("owner_ads_product_banner_desc")}
            ctaLabel={t("owner_ads_product_select_apply")}
            onNavigate={() => setProductSelectOpen(false)}
          />
        </div>
      </DibayBottomSheet>
    </div>
  );
}
