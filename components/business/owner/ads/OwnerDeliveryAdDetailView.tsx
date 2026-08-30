"use client";

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
  ownerStoreAdminFooterFixedClass,
} from "@/lib/business/owner-admin-footer-actions";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { deliveryAdPlacementI18nKeys } from "@/lib/stores/advertising/delivery-ad-placement-language";
import {
  ownerDeliveryAdNextActions,
  type DeliveryAdOwnerProductKind,
  type OwnerNextAction,
} from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import {
  ownerLifecycleStatusI18nKey,
  ownerReviewStatusI18nKey,
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

type HistoryItem = { action: string; reason: string | null; createdAt: string };

type DetailCampaign = OwnerSponsoredCampaignRow & {
  productKind?: DeliveryAdOwnerProductKind;
};

export function OwnerDeliveryAdDetailView({ campaignId }: { campaignId: string }) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeIdQ = sp.get("storeId")?.trim() ?? "";
  const productQ = sp.get("product")?.trim() === "banner" ? "banner" : null;
  const [storeId, setStoreId] = useState(storeIdQ);
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

  const load = useCallback(async () => {
    if (!storeId) {
      const hub = await fetch("/api/me/delivery-ads", { credentials: "include" });
      const hubJson = (await hub.json()) as {
        ok?: boolean;
        campaigns?: DetailCampaign[];
      };
      const found = (hubJson.campaigns ?? []).find((c) => c.id === campaignId);
      if (!found) {
        setError("forbidden");
        setLoaded(true);
        return;
      }
      setStoreId(found.storeId);
      setCampaign(found);
      if (found.productKind === "banner") setProductKind("banner");
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
        error?: string;
      };
      if (res.ok && json.ok && json.campaign) {
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
    setCampaign(json.campaign);
    setHistory(json.history ?? []);
    setPlacementPreview(json.placementPreview ?? null);
    if (json.meta?.productKind === "banner") setProductKind("banner");
    else if (json.meta?.productKind === "store_sponsored") setProductKind("store_sponsored");
    setLoaded(true);
  }, [campaignId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
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
  }, [campaignId, perfRange]);

  const nextActions = useMemo((): OwnerNextAction[] => {
    if (!campaign || !storeId) return [];
    return ownerDeliveryAdNextActions({
      lifecycleStatus: campaign.lifecycleStatus,
      productKind,
      storeId,
      campaignId: campaign.id,
    });
  }, [campaign, productKind, storeId]);

  const actionCtas = nextActions.filter(
    (a): a is Extract<OwnerNextAction, { kind: "action" }> => a.kind === "action"
  );
  const editHref = nextActions.find((a) => a.kind === "href");

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
          setError(json.error || "generic");
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
        setError(json.error || "generic");
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

  const footerBottom = "calc(60px + var(--safe-bottom, 0px))";
  const productTitle =
    productKind === "banner"
      ? t("owner_ads_product_banner")
      : t("owner_ads_product_store_sponsored");

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pt-4`}
      style={{ paddingBottom: actionCtas.length ? 88 : 24 }}
    >
      <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_ads_detail_title")}</h1>

      {!loaded ? (
        <p className="mt-4 text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
      ) : !campaign ? (
        <p className="mt-4 text-[13px] text-red-600" role="alert">
          {safeT("owner_ads_error_generic", {
            fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Something went wrong. Please try again.",
          })}
        </p>
      ) : (
        <>
          {error ? (
            <p className="mt-2 text-[13px] text-red-600" role="alert">
              {safeT("owner_ads_error_generic", {
                fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
                fallbackEn: "Something went wrong. Please try again.",
              })}
            </p>
          ) : null}

          <OwnerStoreAdminDashSection title={productTitle}>
            <p className="text-[14px] font-semibold text-sam-fg">
              {t(ownerLifecycleStatusI18nKey(campaign.lifecycleStatus))}
            </p>
            <p className="mt-1 text-[12px] text-sam-muted">
              {t(ownerReviewStatusI18nKey(campaign.reviewStatus))}
            </p>
            <p className="mt-2 text-[12px] text-sam-muted">ID: {campaign.id}</p>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("owner_ads_inventory_title")}>
            <p className="text-[13px] text-sam-fg">
              {deliveryAdPlacementI18nKeys(campaign.inventoryKeys ?? [])
                .map((k) => t(k as MessageKey))
                .join(" · ") || "—"}
            </p>
            <p className="mt-2 text-[13px] text-sam-muted">
              {t("owner_ads_period")}: {campaign.startAt.slice(0, 10)} ~ {campaign.endAt.slice(0, 10)}
            </p>
            <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_pricing_not_configured")}</p>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("delivery_ads_preview_detail_section_title")}>
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

          <OwnerStoreAdminDashSection title={t("delivery_ads_perf_section_title")}>
            <DeliveryAdPerformancePanel
              performance={performance}
              loading={perfLoading}
              range={perfRange}
              onRangeChange={setPerfRange}
            />
          </OwnerStoreAdminDashSection>

          {campaign.lifecycleStatus === "PAUSED_ADMIN" ? (
            <div className="rounded-ui-rect border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
              {t("owner_ads_paused_admin_notice")}
              {campaign.reviewNotes ? <p className="mt-1">{campaign.reviewNotes}</p> : null}
            </div>
          ) : null}

          {(campaign.lifecycleStatus === "CHANGES_REQUESTED" ||
            campaign.lifecycleStatus === "REJECTED") &&
          campaign.reviewNotes ? (
            <OwnerStoreAdminDashSection title={t("owner_ads_admin_response")}>
              <p className="text-[13px] text-sam-fg whitespace-pre-wrap">{campaign.reviewNotes}</p>
            </OwnerStoreAdminDashSection>
          ) : null}

          {history.length > 0 ? (
            <OwnerStoreAdminDashSection title={t("owner_ads_history")}>
              <ul className="space-y-2 text-[12px] text-sam-muted">
                {history.map((h, i) => (
                  <li key={`${h.createdAt}-${i}`}>
                    <span className="font-medium text-sam-fg">{h.action}</span>
                    {" · "}
                    {h.createdAt.slice(0, 19).replace("T", " ")}
                    {h.reason ? ` — ${h.reason}` : ""}
                  </li>
                ))}
              </ul>
            </OwnerStoreAdminDashSection>
          ) : null}

          {editHref && editHref.kind === "href" ? (
            <button
              type="button"
              className="mt-2 text-[13px] font-semibold text-signature underline"
              onClick={() => router.push(editHref.href)}
            >
              {t(editHref.labelKey)}
            </button>
          ) : null}

          {actionCtas.length > 0 ? (
            <BodyPortal>
              <footer
                className={ownerStoreAdminFooterFixedClass({ aboveBottomNav: true })}
                style={{ bottom: footerBottom }}
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
                    <button
                      type="button"
                      className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                      disabled={busy}
                      onClick={() => setConfirm(actionCtas[0]!.action)}
                    >
                      {t(actionCtas[0]!.labelKey)}
                    </button>
                  </div>
                  {actionCtas.length > 1 ? (
                    <div className="flex gap-2 border-t border-sam-border p-2">
                      {actionCtas.slice(1).map((c) => (
                        <button
                          key={c.action}
                          type="button"
                          disabled={busy}
                          className={`min-h-[44px] flex-1 rounded-ui-rect px-2 text-[13px] font-semibold ${
                            c.tone === "danger"
                              ? "bg-red-600 text-white"
                              : "bg-sam-app text-sam-fg border border-sam-border"
                          }`}
                          onClick={() => setConfirm(c.action)}
                        >
                          {t(c.labelKey)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </footer>
            </BodyPortal>
          ) : null}
        </>
      )}

      {confirm && confirmCopy ? (
        <OwnerStoreAdminConfirmModal
          open
          titleId="owner-delivery-ad-confirm"
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
