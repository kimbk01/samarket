"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-footer-actions";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import {
  getOwnerDeliveryAdRequiredActionPresentation,
  ownerDeliveryAdNextActions,
  type DeliveryAdOwnerProductKind,
  type OwnerNextAction,
} from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import {
  ownerLifecycleStatusI18nKey,
  type OwnerCampaignAction,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import { DeliveryAdCampaignPlacementPreviews } from "@/components/stores/advertising/DeliveryAdCampaignPlacementPreviews";
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";
import { decodeOwnerAdPackagePricingModel } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED,
  ownerAdsDetailPanelsForLifecycle,
  ownerAdsFundingErrorI18nKey,
  ownerAdsShouldShowFundingPanel,
} from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";
import {
  OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED,
  ownerAdsShouldMountOperationsPanel,
  ownerAdsShouldShowContactAdminCta,
  type OwnerAdsOpsBackendCapability,
} from "@/lib/stores/advertising/owner-delivery-ad-r2-operations";
import { DeliveryAdOperationsPanel } from "@/components/stores/advertising/DeliveryAdOperationsPanel";
import { Sam } from "@/lib/ui/css-vars";

type HistoryItem = { action: string; reason: string | null; createdAt: string };

type CommercialSnapshotSoft = {
  packageDisplayName?: string | null;
  durationDays?: number | null;
  basePriceMinor?: number | null;
  partnerDiscountPercent?: number | null;
  finalPayableMinor?: number | null;
  basePriceDisplay?: string | null;
  finalPayableDisplay?: string | null;
};

type DetailCampaign = OwnerSponsoredCampaignRow & {
  productKind?: DeliveryAdOwnerProductKind;
  commercialSnapshot?: CommercialSnapshotSoft | null;
  storeName?: string | null;
};

function requiredActionToneClass(
  tone: ReturnType<typeof getOwnerDeliveryAdRequiredActionPresentation>["tone"]
): string {
  switch (tone) {
    case "urgent":
      return "border-amber-400 bg-amber-50 text-amber-950";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "info":
      return "border-sam-border bg-sam-app text-sam-fg";
    default:
      return "border-sam-border bg-sam-surface text-sam-fg";
  }
}

function draftEditHref(productKind: DeliveryAdOwnerProductKind, storeId: string, campaignId: string) {
  const base =
    productKind === "banner"
      ? DELIVERY_AD_OWNER_ROUTES.createBanner
      : DELIVERY_AD_OWNER_ROUTES.createStoreSponsored;
  return `${base}?${new URLSearchParams({ storeId, campaignId }).toString()}`;
}

export function OwnerDeliveryAdDetailView({ campaignId }: { campaignId: string }) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeIdQ = sp.get("storeId")?.trim() ?? "";
  const productQ = sp.get("product")?.trim() === "banner" ? "banner" : null;
  const { formPadStyle, footerPadStyle, footerFixedClassName } = useOwnerAdminFormKeyboard({
    aboveBottomNav: true,
  });
  const [storeId, setStoreId] = useState(storeIdQ);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<DetailCampaign | null>(null);
  const [productKind, setProductKind] = useState<DeliveryAdOwnerProductKind>(
    productQ ?? "store_sponsored"
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<OwnerCampaignAction | "delete" | null>(null);
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [placementPreview, setPlacementPreview] =
    useState<DeliveryAdPlacementPreviewPayload | null>(null);
  const [fundingStatus, setFundingStatus] = useState<
    "UNFUNDED" | "FUNDED" | "REFUNDED" | null
  >(null);
  const [cashBalanceMinor, setCashBalanceMinor] = useState<number | null>(null);
  const [fundedAt, setFundedAt] = useState<string | null>(null);
  const [fundBusy, setFundBusy] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [opsCapability, setOpsCapability] =
    useState<OwnerAdsOpsBackendCapability>("unknown");
  const [focusOperations, setFocusOperations] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) {
      const hub = await fetch("/api/me/delivery-ads", { credentials: "include" });
      const hubJson = (await hub.json()) as {
        ok?: boolean;
        campaigns?: DetailCampaign[];
        stores?: Array<{ id: string; storeName: string }>;
      };
      const found = (hubJson.campaigns ?? []).find((c) => c.id === campaignId);
      if (!found) {
        setError("forbidden");
        setLoaded(true);
        return;
      }
      setStoreId(found.storeId);
      const sn = (hubJson.stores ?? []).find((s) => s.id === found.storeId)?.storeName;
      if (sn) setStoreName(sn);
      setCampaign(found);
      if (found.productKind === "banner") setProductKind("banner");
      if (found.lifecycleStatus === "DRAFT") {
        router.replace(draftEditHref(found.productKind === "banner" ? "banner" : "store_sponsored", found.storeId, found.id));
        return;
      }
      setLoaded(true);
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(found.storeId)}/delivery-ads/${encodeURIComponent(campaignId)}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        campaign?: DetailCampaign;
        history?: HistoryItem[];
        meta?: { productKind?: DeliveryAdOwnerProductKind };
        placementPreview?: DeliveryAdPlacementPreviewPayload | null;
      };
      if (res.ok && json.ok && json.campaign) {
        if (json.campaign.lifecycleStatus === "DRAFT") {
          router.replace(
            draftEditHref(
              json.meta?.productKind === "banner" ? "banner" : "store_sponsored",
              found.storeId,
              campaignId
            )
          );
          return;
        }
        setCampaign(json.campaign);
        setHistory(json.history ?? []);
        setPlacementPreview(json.placementPreview ?? null);
        if (json.meta?.productKind === "banner") setProductKind("banner");
        else if (json.meta?.productKind === "store_sponsored") setProductKind("store_sponsored");
      }
      return;
    }

    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(campaignId)}`,
      { credentials: "include" }
    );
    const json = (await res.json()) as {
      ok?: boolean;
      campaign?: DetailCampaign;
      history?: HistoryItem[];
      meta?: { productKind?: DeliveryAdOwnerProductKind };
      placementPreview?: DeliveryAdPlacementPreviewPayload | null;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(json.error || "forbidden");
      setLoaded(true);
      return;
    }
    const pk =
      json.meta?.productKind === "banner"
        ? "banner"
        : json.meta?.productKind === "store_sponsored"
          ? "store_sponsored"
          : productKind;
    if (json.campaign.lifecycleStatus === "DRAFT") {
      router.replace(draftEditHref(pk, storeId, campaignId));
      return;
    }
    setCampaign(json.campaign);
    setHistory(json.history ?? []);
    setPlacementPreview(json.placementPreview ?? null);
    setProductKind(pk);
    setLoaded(true);
  }, [campaignId, storeId, productKind, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const panels = useMemo(
    () =>
      campaign
        ? ownerAdsDetailPanelsForLifecycle(campaign.lifecycleStatus)
        : new Set<string>(),
    [campaign]
  );

  const snap = campaign?.commercialSnapshot ?? null;
  const showFunding = Boolean(
    campaign &&
      ownerAdsShouldShowFundingPanel({
        lifecycleStatus: campaign.lifecycleStatus,
        hasPricedSnapshot: Boolean(snap && (snap.finalPayableMinor ?? 0) > 0),
        finalPayableMinor: snap?.finalPayableMinor,
      })
  );

  useEffect(() => {
    if (!showFunding || !loaded) return;
    let cancelled = false;
    const run = async () => {
      setFundError(null);
      try {
        const res = await fetch(
          `/api/me/delivery-ads/${encodeURIComponent(campaignId)}/funding?product=${encodeURIComponent(productKind)}`,
          { credentials: "include" }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          funding?: {
            fundingStatus?: "UNFUNDED" | "FUNDED" | "REFUNDED";
            fundedAt?: string | null;
          };
          businessCash?: { balanceMinor?: number };
        };
        if (cancelled || !res.ok || !json.ok) return;
        setFundingStatus(json.funding?.fundingStatus ?? "UNFUNDED");
        setFundedAt(json.funding?.fundedAt ?? null);
        setCashBalanceMinor(
          typeof json.businessCash?.balanceMinor === "number"
            ? json.businessCash.balanceMinor
            : 0
        );
      } catch {
        /* optional until ready */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [campaignId, productKind, loaded, showFunding]);

  useEffect(() => {
    if (!campaign || !panels.has("performance")) return;
    let cancelled = false;
    setPerfLoading(true);
    void fetch(
      `/api/me/delivery-ads/${encodeURIComponent(campaignId)}/performance?range=${encodeURIComponent(perfRange)}`,
      { credentials: "include" }
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
  }, [campaign, campaignId, perfRange, panels]);

  const nextActions = useMemo((): OwnerNextAction[] => {
    if (!campaign || !storeId) return [];
    return ownerDeliveryAdNextActions({
      lifecycleStatus: campaign.lifecycleStatus,
      productKind,
      storeId,
      campaignId: campaign.id,
    }).filter((a) => !(a.kind === "action" && a.action === "delete"));
  }, [campaign, productKind, storeId]);

  const requiredAction = useMemo(() => {
    if (!campaign || !storeId) return null;
    return getOwnerDeliveryAdRequiredActionPresentation({
      lifecycleStatus: campaign.lifecycleStatus,
      productKind,
      storeId,
      campaignId: campaign.id,
    });
  }, [campaign, productKind, storeId]);

  const actionCtas = nextActions.filter(
    (a): a is Extract<OwnerNextAction, { kind: "action" }> => a.kind === "action"
  );
  const primaryAction = actionCtas[0] ?? null;
  const secondaryActions = actionCtas.slice(1);

  const runAction = async (action: OwnerCampaignAction | "delete") => {
    if (!campaign || !storeId) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(campaign.id)}`,
          { method: "DELETE", credentials: "include" }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setError("generic");
          return;
        }
        router.push(DELIVERY_AD_OWNER_ROUTES.hub);
        return;
      }
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(campaign.id)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, productKind }),
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: DetailCampaign;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError("generic");
        return;
      }
      setCampaign(json.campaign);
      await load();
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const confirmCopy =
    confirm === "pause"
      ? { title: t("owner_ads_pause_confirm_title"), body: t("owner_ads_pause_confirm_body") }
      : confirm === "resume"
        ? { title: t("owner_ads_resume_confirm_title"), body: t("owner_ads_resume_confirm_body") }
        : confirm === "end"
          ? { title: t("owner_ads_end_confirm_title"), body: t("owner_ads_end_confirm_body") }
          : confirm === "delete"
            ? { title: t("owner_ads_delete_confirm_title"), body: t("owner_ads_delete_confirm_body") }
            : null;

  const productTitle =
    productKind === "banner"
      ? t("owner_ads_product_banner")
      : t("owner_ads_product_store_sponsored");

  const packageId = campaign
    ? decodeOwnerAdPackagePricingModel(campaign.pricingModel)
    : null;

  if (!loaded && !campaign) {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pt-4`} data-owner-ads-detail="r1">
        <p className="text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pt-4`} data-owner-ads-detail="r1">
        <p className="text-[13px] text-red-600" role="alert">
          {safeT("owner_ads_error_generic", {
            fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Something went wrong. Please try again.",
          })}
        </p>
      </div>
    );
  }

  void OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED;
  void OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED;
  const showOpsPanel = ownerAdsShouldMountOperationsPanel(campaign.lifecycleStatus);
  const showContactAdmin = ownerAdsShouldShowContactAdminCta({
    lifecycleStatus: campaign.lifecycleStatus,
    opsCapability,
  });

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-lg px-4 pt-4`}
      style={actionCtas.length ? formPadStyle : { paddingBottom: 24 }}
      data-owner-ads-detail="r1"
      data-owner-ads-lifecycle={campaign.lifecycleStatus}
    >
      <h1 className="text-[18px] font-bold text-sam-fg">
        {t(ownerLifecycleStatusI18nKey(campaign.lifecycleStatus))}
      </h1>

      {error ? (
        <p className="mt-2 text-[13px] text-red-600" role="alert">
          {safeT("owner_ads_error_generic", {
            fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Something went wrong. Please try again.",
          })}
        </p>
      ) : null}

      {panels.has("identity") ? (
        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-owner-ads-detail-section="identity"
        >
          <p className="text-[12px] font-medium text-sam-muted">{productTitle}</p>
          <p className="mt-1 text-[16px] font-bold text-sam-fg break-words">
            {storeName || campaign.storeName || campaign.title?.trim() || productTitle}
          </p>
          <p className="mt-2 text-[13px] text-sam-muted">
            {deliveryAdPlacementI18nKeys(campaign.inventoryKeys ?? [])
              .map((k) => t(k as MessageKey))
              .join(" · ") || "—"}
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            {t("owner_ads_period")}: {campaign.startAt.slice(0, 10)} ~ {campaign.endAt.slice(0, 10)}
          </p>
        </section>
      ) : null}

      {panels.has("required_action") && requiredAction ? (
        <section
          className={`rounded-ui-rect border p-4 ${requiredActionToneClass(requiredAction.tone)}`}
          data-owner-ads-detail-section="required-action"
        >
          <p className="text-[16px] font-bold">{t(requiredAction.titleKey)}</p>
          <p className="mt-2 text-[13px] leading-snug">{t(requiredAction.bodyKey)}</p>
          {requiredAction.primaryHref ? (
            <Link
              href={requiredAction.primaryHref.href}
              className={`${Sam.btn.primary} mt-3 flex min-h-[44px] w-full items-center justify-center px-4 text-[14px] font-semibold`}
              data-owner-ads-required-cta="edit"
            >
              {t(requiredAction.primaryHref.labelKey)}
            </Link>
          ) : null}
          {requiredAction.guidanceHref ? (
            <Link
              href={requiredAction.guidanceHref.href}
              className={`${Sam.btn.secondary} mt-3 flex min-h-[44px] w-full items-center justify-center px-4 text-[14px] font-semibold`}
            >
              {t(requiredAction.guidanceHref.labelKey)}
            </Link>
          ) : null}
          {showContactAdmin && !campaign.reviewNotes ? (
            <button
              type="button"
              className={`${Sam.btn.secondary} mt-3 flex min-h-[44px] w-full items-center justify-center px-4 text-[14px] font-semibold`}
              data-owner-ads-contact-admin="1"
              onClick={() => {
                setFocusOperations(true);
                const el = document.getElementById("delivery-ad-operations");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {safeT("owner_ads_contact_admin_cta", {
                fallbackKo: "관리자에게 문의",
                fallbackEn: "Contact admin",
              })}
            </button>
          ) : null}
        </section>
      ) : null}

      {panels.has("admin_reason") && campaign.reviewNotes ? (
        <OwnerStoreAdminDashSection title={t("owner_ads_admin_response")}>
          <div data-owner-ads-detail-section="admin-reason">
            <p className="whitespace-pre-wrap break-words text-[13px] text-sam-fg">
              {campaign.reviewNotes}
            </p>
            {showContactAdmin ? (
              <button
                type="button"
                className={`${Sam.btn.secondary} mt-3 flex min-h-[44px] w-full items-center justify-center px-4 text-[14px] font-semibold`}
                data-owner-ads-contact-admin="1"
                onClick={() => {
                  setFocusOperations(true);
                  const el = document.getElementById("delivery-ad-operations");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {safeT("owner_ads_contact_admin_cta", {
                  fallbackKo: "관리자에게 문의",
                  fallbackEn: "Contact admin",
                })}
              </button>
            ) : null}
          </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      {panels.has("commercial_summary") ? (
        <div data-owner-ads-detail-section="commercial">
          <OwnerStoreAdminDashSection title={t("owner_ads_commercial_facts_title")}>
            {!packageId && !snap ? (
              <p className="text-[13px] text-sam-muted">{t("owner_ads_price_unset")}</p>
            ) : (
              <>
                {snap?.packageDisplayName ? (
                  <p className="text-[13px] text-sam-fg">{snap.packageDisplayName}</p>
                ) : null}
                {snap?.durationDays != null ? (
                  <p className="mt-1 text-[12px] text-sam-muted">
                    {t("owner_ads_period_duration_days").replace(
                      "{days}",
                      String(snap.durationDays)
                    )}
                  </p>
                ) : null}
                {snap?.finalPayableDisplay || snap?.finalPayableMinor != null ? (
                  <p className="mt-2 text-[15px] font-bold text-sam-fg">
                    {t("owner_ads_price_total")}:{" "}
                    {snap.finalPayableDisplay ??
                      formatDeliveryAdPhpMinor(snap.finalPayableMinor ?? 0)}
                  </p>
                ) : null}
              </>
            )}
          </OwnerStoreAdminDashSection>
        </div>
      ) : null}

      {panels.has("preview") ? (
        <div data-owner-ads-detail-section="preview">
          <OwnerStoreAdminDashSection title={t("owner_ads_section_preview")}>
            <DeliveryAdCampaignPlacementPreviews
              productKind={productKind}
              inventoryKeys={campaign.inventoryKeys ?? []}
              renderContext="owner_preview"
              placementPreview={placementPreview}
              bannerCreative={
                productKind === "banner" && campaign.imageUrl
                  ? {
                      assetUrl: campaign.imageUrl,
                      headline: campaign.headline ?? campaign.title ?? null,
                      subcopy: null,
                      alt: campaign.title || "banner",
                    }
                  : null
              }
              ctaLabel={productKind === "banner" ? t("owner_ads_banner_cta_store") : null}
            />
          </OwnerStoreAdminDashSection>
        </div>
      ) : null}

      {showFunding ? (
        <div data-owner-ads-detail-section="funding">
          <OwnerStoreAdminDashSection title={t("owner_ads_funding_section")}>
            {cashBalanceMinor != null ? (
              <p className="text-[12px] text-sam-muted">
                {t("owner_ads_funding_balance")}: {formatDeliveryAdPhpMinor(cashBalanceMinor)}
              </p>
            ) : null}
            {snap?.finalPayableMinor != null ? (
              <p className="mt-1 text-[13px] text-sam-fg">
                {t("owner_ads_price_total")}:{" "}
                {snap.finalPayableDisplay ?? formatDeliveryAdPhpMinor(snap.finalPayableMinor)}
              </p>
            ) : null}
            {fundingStatus === "FUNDED" ? (
              <p className="mt-2 text-[13px] font-semibold text-sam-fg">
                {t("owner_ads_funding_done")}
                {fundedAt ? ` · ${fundedAt.slice(0, 16)}` : ""}
              </p>
            ) : fundingStatus === "REFUNDED" ? (
              <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_funding_refunded")}</p>
            ) : (
              <>
                <p className="mt-2 text-[13px] font-semibold text-sam-fg">
                  {t("owner_ads_funding_needed")}
                </p>
                {fundError ? (
                  <p className="mt-1 text-[12px] text-red-600" data-owner-ads-fund-error="mapped">
                    {t(ownerAdsFundingErrorI18nKey(fundError))}
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-sam-muted">
                    {t("owner_ads_business_cash_topup_unavailable")}
                  </p>
                )}
                <button
                  type="button"
                  className={`${Sam.btn.primary} mt-3`}
                  disabled={fundBusy}
                  data-owner-ads-fund-cta="1"
                  onClick={() => {
                    void (async () => {
                      setFundBusy(true);
                      setFundError(null);
                      try {
                        const res = await fetch(
                          `/api/me/delivery-ads/${encodeURIComponent(campaignId)}/funding`,
                          {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ productKind }),
                          }
                        );
                        const json = (await res.json()) as {
                          ok?: boolean;
                          error?: string;
                          result?: { balanceMinor?: number };
                        };
                        if (!res.ok || !json.ok) {
                          setFundError(json.error || "fund_failed");
                          return;
                        }
                        setFundingStatus("FUNDED");
                        if (typeof json.result?.balanceMinor === "number") {
                          setCashBalanceMinor(json.result.balanceMinor);
                        }
                        setFundedAt(new Date().toISOString());
                      } catch {
                        setFundError("network");
                      } finally {
                        setFundBusy(false);
                      }
                    })();
                  }}
                >
                  {t("owner_ads_funding_pay_cta")}
                </button>
              </>
            )}
          </OwnerStoreAdminDashSection>
        </div>
      ) : null}

      {panels.has("performance") ? (
        <div data-owner-ads-detail-section="performance">
          <OwnerStoreAdminDashSection title={t("delivery_ads_perf_section_title")}>
            <DeliveryAdPerformancePanel
              performance={performance}
              loading={perfLoading}
              range={perfRange}
              onRangeChange={setPerfRange}
              compact
            />
          </OwnerStoreAdminDashSection>
        </div>
      ) : null}

      {panels.has("history") && history.length > 0 ? (
        <div data-owner-ads-detail-section="history">
          <OwnerStoreAdminDashSection title={t("owner_ads_history")}>
            <ul className="space-y-2 text-[12px] text-sam-muted">
              {history.map((h, i) => (
                <li key={`${h.createdAt}-${i}`}>
                  <span className="font-medium text-sam-fg">{h.action}</span>
                  {" · "}
                  {h.createdAt.slice(0, 19).replace("T", " ")}
                </li>
              ))}
            </ul>
          </OwnerStoreAdminDashSection>
        </div>
      ) : null}

      {showOpsPanel && storeId ? (
        <div data-owner-ads-detail-section="operations">
          <OwnerStoreAdminDashSection title={t("delivery_ad_ops_ui_section_title")}>
            <DeliveryAdOperationsPanel
              actorRole="owner"
              productKind={productKind}
              campaignId={campaign.id}
              storeId={storeId}
              hideHeading
              focusOperations={focusOperations}
              onCapabilityChange={setOpsCapability}
            />
          </OwnerStoreAdminDashSection>
        </div>
      ) : null}

      {actionCtas.length > 0 ? (
        <BodyPortal>
          <footer
            className={footerFixedClassName}
            style={footerPadStyle}
            data-owner-ads-footer="owner-admin-ssot"
          >
            <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
              <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
                <button
                  type="button"
                  className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                  disabled={busy}
                  onClick={() => router.push(DELIVERY_AD_OWNER_ROUTES.hub)}
                >
                  {t("owner_ads_back_hub")}
                </button>
                {primaryAction ? (
                  <button
                    type="button"
                    className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                    disabled={busy}
                    onClick={() => {
                      if (
                        primaryAction.action === "pause" ||
                        primaryAction.action === "end" ||
                        primaryAction.action === "resume"
                      ) {
                        setConfirm(primaryAction.action);
                      } else {
                        void runAction(primaryAction.action);
                      }
                    }}
                  >
                    {t(primaryAction.labelKey)}
                  </button>
                ) : null}
              </div>
              {secondaryActions.length > 0 ? (
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {secondaryActions.map((a) => (
                    <button
                      key={a.action}
                      type="button"
                      className="text-[12px] font-medium text-sam-muted underline"
                      disabled={busy}
                      onClick={() => {
                        if (a.action === "pause" || a.action === "end" || a.action === "resume") {
                          setConfirm(a.action);
                        } else {
                          void runAction(a.action);
                        }
                      }}
                    >
                      {t(a.labelKey)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </footer>
        </BodyPortal>
      ) : null}

      {confirm && confirmCopy ? (
        <OwnerStoreAdminConfirmModal
          open
          titleId="owner-ads-confirm"
          title={confirmCopy.title}
          description={confirmCopy.body}
          confirmLabel={t("owner_ads_confirm")}
          cancelLabel={t("owner_ads_cancel")}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runAction(confirm)}
        />
      ) : null}
    </div>
  );
}
