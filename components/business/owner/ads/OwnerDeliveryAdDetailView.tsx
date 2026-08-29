"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import {
  ownerInventoryI18nKey,
  ownerLifecycleStatusI18nKey,
  ownerReviewStatusI18nKey,
  type OwnerCampaignAction,
  type OwnerStoreSponsoredInventoryKey,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";

type HistoryItem = { action: string; reason: string | null; createdAt: string };

export function OwnerDeliveryAdDetailView({ campaignId }: { campaignId: string }) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeIdQ = sp.get("storeId")?.trim() ?? "";
  const [storeId, setStoreId] = useState(storeIdQ);
  const [campaign, setCampaign] = useState<OwnerSponsoredCampaignRow | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<OwnerCampaignAction | "delete" | null>(null);
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) {
      // Resolve store via hub list when storeId missing
      const hub = await fetch("/api/me/delivery-ads", { credentials: "include" });
      const hubJson = (await hub.json()) as {
        ok?: boolean;
        campaigns?: OwnerSponsoredCampaignRow[];
      };
      const found = (hubJson.campaigns ?? []).find((c) => c.id === campaignId);
      if (!found) {
        setError("forbidden");
        setLoaded(true);
        return;
      }
      setStoreId(found.storeId);
      setCampaign(found);
      setLoaded(true);
      // still load detail for history
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(found.storeId)}/delivery-ads/${encodeURIComponent(campaignId)}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        campaign?: OwnerSponsoredCampaignRow;
        history?: HistoryItem[];
        error?: string;
      };
      if (res.ok && json.ok && json.campaign) {
        setCampaign(json.campaign);
        setHistory(json.history ?? []);
      }
      return;
    }

    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(campaignId)}`,
      { credentials: "include" }
    );
    const json = (await res.json()) as {
      ok?: boolean;
      campaign?: OwnerSponsoredCampaignRow;
      history?: HistoryItem[];
      error?: string;
    };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(json.error || "forbidden");
      setLoaded(true);
      return;
    }
    setCampaign(json.campaign);
    setHistory(json.history ?? []);
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
          body: JSON.stringify({ action }),
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerSponsoredCampaignRow;
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

  const status = campaign?.lifecycleStatus;
  const ctas: Array<{ action: OwnerCampaignAction | "delete"; label: string; tone?: "danger" }> = [];
  if (status === "DRAFT") {
    ctas.push({ action: "submit", label: t("owner_ads_action_submit") });
    ctas.push({
      action: "delete",
      label: t("owner_ads_action_delete"),
      tone: "danger",
    });
  }
  if (status === "CHANGES_REQUESTED") {
    ctas.push({ action: "resubmit", label: t("owner_ads_action_resubmit") });
  }
  if (status === "ACTIVE") {
    ctas.push({ action: "pause", label: t("owner_ads_action_pause") });
    ctas.push({ action: "end", label: t("owner_ads_action_end"), tone: "danger" });
  }
  if (status === "PAUSED_OWNER") {
    ctas.push({ action: "resume", label: t("owner_ads_action_resume") });
    ctas.push({ action: "end", label: t("owner_ads_action_end"), tone: "danger" });
  }

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

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pt-4`} style={{ paddingBottom: ctas.length ? 88 : 24 }}>
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

          <OwnerStoreAdminDashSection title={t("owner_ads_product_store_sponsored")}>
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
              {(campaign.inventoryKeys as OwnerStoreSponsoredInventoryKey[])
                .map((k) => t(ownerInventoryI18nKey(k)))
                .join(" · ") || "—"}
            </p>
            <p className="mt-2 text-[13px] text-sam-muted">
              {t("owner_ads_period")}: {campaign.startAt.slice(0, 10)} ~ {campaign.endAt.slice(0, 10)}
            </p>
            <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_pricing_not_configured")}</p>
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

          {status === "DRAFT" || status === "CHANGES_REQUESTED" ? (
            <button
              type="button"
              className="mt-2 text-[13px] font-semibold text-signature underline"
              onClick={() =>
                router.push(
                  `${DELIVERY_AD_OWNER_ROUTES.createStoreSponsored}?storeId=${encodeURIComponent(campaign.storeId)}&campaignId=${encodeURIComponent(campaign.id)}`
                )
              }
            >
              {t("owner_ads_edit_again")}
            </button>
          ) : null}

          {ctas.length > 0 ? (
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
                      onClick={() => setConfirm(ctas[0]!.action)}
                    >
                      {ctas[0]!.label}
                    </button>
                  </div>
                  {ctas.length > 1 ? (
                    <div className="flex gap-2 border-t border-sam-border p-2">
                      {ctas.slice(1).map((c) => (
                        <button
                          key={c.action}
                          type="button"
                          disabled={busy}
                          className={`min-h-[44px] flex-1 rounded-ui-rect px-2 text-[13px] font-semibold ${
                            c.tone === "danger"
                              ? "bg-red-600 text-white"
                              : "border border-sam-border bg-sam-surface text-sam-fg"
                          }`}
                          onClick={() => setConfirm(c.action)}
                        >
                          {c.label}
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

      <OwnerStoreAdminConfirmModal
        open={confirm != null && confirmCopy != null}
        titleId="owner-ads-confirm"
        title={confirmCopy?.title ?? ""}
        description={confirmCopy?.body}
        busy={busy}
        confirmTone={confirm === "end" || confirm === "delete" ? "danger" : "primary"}
        cancelLabel={t("owner_ads_cancel")}
        confirmLabel={t("owner_ads_confirm")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void runAction(confirm);
        }}
      />
    </div>
  );
}
