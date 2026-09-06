"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { PLATFORM_POPUP_OWNER_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import type { DeliveryAdOwnerProductKind } from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { CurrencyBalanceCard } from "@/components/currency";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { ownerAdsHubCardPrimaryCta } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";
import { DELIVERY_AD_OWNER_HUB_KPI_BUCKETS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { DeliveryAdOwnerStatusBadge } from "@/components/stores/advertising/DeliveryAdOwnerStatusBadge";
import { DeliveryAdOwnerProductSelectCard } from "@/components/stores/advertising/DeliveryAdOwnerProductSelectCard";
import type { OwnerAdsSummaryBucket } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerDeliveryAdCashChargeSheet } from "@/components/business/owner/ads/OwnerDeliveryAdCashChargeSheet";

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

const ENDED_HUB_CAMPAIGN_STATUSES = new Set<HubCampaign["lifecycleStatus"]>([
  "ENDED",
  "TERMINATED",
  "ARCHIVED",
  "REJECTED",
  "EXHAUSTED",
]);

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
  const [cashChargeOpen, setCashChargeOpen] = useState(false);
  const [unreadByCampaignId, setUnreadByCampaignId] = useState<Record<string, number>>({});
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<HubCampaign | null>(null);
  const [draftDeleteBusy, setDraftDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
        unreadByCampaignId?: Record<string, number>;
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

  const endedStatuses = ENDED_HUB_CAMPAIGN_STATUSES;

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const rank = hubCampaignSortRank(a.lifecycleStatus) - hubCampaignSortRank(b.lifecycleStatus);
      if (rank !== 0) return rank;
      const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTs - aTs;
    });
  }, [campaigns]);

  const activeCampaigns = useMemo(
    () => sortedCampaigns.filter((c) => !endedStatuses.has(c.lifecycleStatus)),
    [sortedCampaigns]
  );

  const endedCampaigns = useMemo(
    () => sortedCampaigns.filter((c) => endedStatuses.has(c.lifecycleStatus)),
    [sortedCampaigns]
  );

  const storeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stores) map.set(s.id, s.storeName);
    return map;
  }, [stores]);

  const deleteDraftCampaign = useCallback(async (c: HubCampaign) => {
    setDraftDeleteBusy(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(c.storeId)}/delivery-ads/${encodeURIComponent(c.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error || "delete_failed");
        return;
      }
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
      setSummary((prev) => ({
        ...prev,
        draft: Math.max(0, (prev.draft ?? 0) - 1),
      }));
      setDraftDeleteTarget(null);
    } catch {
      setActionError("network");
    } finally {
      setDraftDeleteBusy(false);
    }
  }, []);

  const summaryItems: Array<{
    key: OwnerAdsSummaryBucket;
    labelKey: MessageKey;
    count: number;
  }> = DELIVERY_AD_OWNER_HUB_KPI_BUCKETS.map((key) => ({
    key,
    labelKey: `owner_ads_summary_${key}` as MessageKey,
    count: summary[key],
  }));

  const todoCampaigns = useMemo(() => {
    return sortedCampaigns.filter((c) => {
      if (c.lifecycleStatus === "CHANGES_REQUESTED") return true;
      return (unreadByCampaignId[c.id] ?? 0) > 0;
    });
  }, [sortedCampaigns, unreadByCampaignId]);

  const greetingText = ownerDisplayName
    ? t("owner_ads_hub_greeting", { name: ownerDisplayName })
    : t("owner_ads_hub_greeting_fallback");

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pb-8 pt-4`}
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
        <div data-owner-ads-cash-consumer="1">
          <CurrencyBalanceCard
            currency="cash"
            amount={cashBalanceMinor ?? 0}
            isMinor
            actions={[
              {
                id: "top_up",
                href: `${OwnerRoutes.finance(stores[0]?.id || "")}#cash-manage`,
                primary: true,
              },
              {
                id: "history",
                href: `${OwnerRoutes.finance(stores[0]?.id || "")}#cash-history`,
              },
            ]}
            footer={
              <p className="text-[12px] text-sam-muted">
                {safeT("owner_ads_business_cash_ad_only", {
                  fallbackKo: "광고·프로모션·배너·파트너 결제에 Cash를 사용합니다.",
                  fallbackEn: "Cash pays for ads, promotions, banners, and partner products.",
                })}
              </p>
            }
          />
        </div>

        {todoCampaigns.length > 0 ? (
          <div
            className="rounded-ui-rect border border-amber-300 bg-amber-50 p-4"
            data-owner-ads-hub-todo="1"
          >
            <p className="text-[14px] font-bold text-amber-950">{t("owner_ads_required_action_section")}</p>
            <ul className="mt-2 space-y-2">
              {todoCampaigns.map((c) => {
                const unread = unreadByCampaignId[c.id] ?? 0;
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-amber-950">
                        {c.title || c.id.slice(0, 8)}
                      </p>
                      <p className="text-[11px] text-amber-900">
                        {c.lifecycleStatus === "CHANGES_REQUESTED"
                          ? t("owner_ads_ra_changes_requested_title")
                          : safeT("owner_ads_hub_unread_ops", {
                              fallbackKo: `새 메시지 ${unread}`,
                              fallbackEn: `${unread} new message(s)`,
                            })}
                      </p>
                    </div>
                    <Link
                      href={`${DELIVERY_AD_OWNER_ROUTES.detail(c.id)}?focus=operations`}
                      className="shrink-0 text-[12px] font-semibold text-[#0A823E]"
                      data-owner-ads-hub-todo-cta={c.id}
                    >
                      {t("owner_ads_next_action_label")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div
          className="grid grid-cols-5 gap-0.5 rounded-ui-rect border border-[#BDBDBD] bg-white p-3 shadow-sm"
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
          {actionError ? (
            <p className="text-[13px] text-red-600" role="alert" data-owner-ads-action-error="1">
              {safeT("owner_ads_error_generic", {
                fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
                fallbackEn: "Something went wrong. Please try again.",
              })}
            </p>
          ) : null}
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
                {activeCampaigns.map((c) => {
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
                  const storeLabel = storeNameById.get(c.storeId) ?? c.title?.trim() ?? "—";
                  const firstPlacement = invLabels.split(" · ")[0]?.trim() || "—";
                  const cardTitle = `${storeLabel} · ${productLabel} · ${firstPlacement}`;
                  return (
                    <li key={c.id}>
                      <div className="rounded-ui-rect border border-[#BDBDBD] bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className="truncate text-[15px] font-semibold text-sam-fg"
                              data-owner-ads-hub-card-title="design-board"
                              data-owner-ads-hub-card-store={c.storeId}
                            >
                              {cardTitle}
                            </p>
                            <p className="mt-1 text-[12px] text-[#757575]">
                              {c.startAt.slice(0, 10)} ~ {c.endAt.slice(0, 10)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <DeliveryAdOwnerStatusBadge status={c.lifecycleStatus} />
                            {(unreadByCampaignId[c.id] ?? 0) > 0 ? (
                              <span
                                className="rounded-full bg-[#0A823E] px-2 py-0.5 text-[10px] font-bold text-white"
                                data-owner-ads-hub-unread={c.id}
                              >
                                {unreadByCampaignId[c.id]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={cta.href}
                            className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} inline-flex min-h-[40px] px-4 text-[13px]`}
                            data-owner-ads-card-cta={c.lifecycleStatus}
                            data-owner-ads-card-cta-primary="1"
                          >
                            {t(cta.labelKey)}
                          </Link>
                          {c.lifecycleStatus === "DRAFT" ? (
                            <button
                              type="button"
                              className="inline-flex min-h-[40px] items-center rounded-ui-rect border border-sam-border px-3 text-[13px] font-medium text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 active:scale-[0.99]"
                              data-owner-ads-card-cta-secondary="delete-draft"
                              disabled={draftDeleteBusy}
                              onClick={() => setDraftDeleteTarget(c)}
                            >
                              {t("owner_ads_delete_draft_menu")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {endedCampaigns.length > 0 ? (
                <div
                  className="mt-4 space-y-2 opacity-70"
                  data-owner-ads-ended-campaigns="1"
                >
                  <h3 className="text-[13px] font-semibold text-[#757575]">
                    {t("owner_ads_summary_ended")} ({endedCampaigns.length})
                  </h3>
                  <ul className="space-y-2">
                    {endedCampaigns.map((c) => {
                      const productKind: DeliveryAdOwnerProductKind =
                        c.productKind === "banner" ? "banner" : "store_sponsored";
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
                      const storeLabel = storeNameById.get(c.storeId) ?? c.title?.trim() ?? "—";
                      return (
                        <li key={c.id}>
                          <div className="rounded-ui-rect border border-[#E0E0E0] bg-[#FAFAFA] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-medium text-[#757575]">
                                  {storeLabel} · {productLabel}
                                </p>
                                <p className="mt-1 text-[11px] text-[#9E9E9E]">
                                  {c.startAt.slice(0, 10)} ~ {c.endAt.slice(0, 10)}
                                </p>
                              </div>
                              <DeliveryAdOwnerStatusBadge status={c.lifecycleStatus} />
                            </div>
                            <Link
                              href={cta.href}
                              className="mt-2 inline-flex min-h-[36px] items-center text-[12px] font-medium text-[#757575]"
                              data-owner-ads-card-cta={c.lifecycleStatus}
                            >
                              {t(cta.labelKey)}
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
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

      <OwnerDeliveryAdCashChargeSheet
        open={cashChargeOpen}
        onClose={() => setCashChargeOpen(false)}
        storeId={stores[0]?.id ?? null}
      />

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
          <DeliveryAdOwnerProductSelectCard
            href={PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup}
            productKind="platform_popup"
            title={safeT("owner_platform_popup_product_title", {
              fallbackKo: "글로벌 팝업 광고",
              fallbackEn: "Global Popup Ad",
            })}
            description={safeT("owner_platform_popup_product_desc", {
              fallbackKo:
                "앱 화면 하단 팝업(36:25). 전체·커뮤니티·거래·배달·마이페이지에 노출. Cash 결제 후 관리자 심사 필요 — 결제만으로 즉시 노출되지 않습니다.",
              fallbackEn:
                "Bottom popup (36:25) on All/Community/Trade/Delivery/My Page. Cash + admin review required — payment alone never goes live.",
            })}
            ctaLabel={t("owner_ads_product_select_apply")}
            onNavigate={() => setProductSelectOpen(false)}
          />
        </div>
      </DibayBottomSheet>

      <OwnerStoreAdminConfirmModal
        open={Boolean(draftDeleteTarget)}
        titleId="owner-ads-hub-delete-draft"
        title={t("owner_ads_delete_draft_sheet_title")}
        description={t("owner_ads_delete_draft_confirm_body")}
        cancelLabel={t("owner_ads_cancel")}
        confirmLabel={t("common_delete")}
        busy={draftDeleteBusy}
        confirmTone="danger"
        onCancel={() => {
          if (!draftDeleteBusy) setDraftDeleteTarget(null);
        }}
        onConfirm={() => {
          if (draftDeleteTarget) void deleteDraftCampaign(draftDeleteTarget);
        }}
      />
    </div>
  );
}
