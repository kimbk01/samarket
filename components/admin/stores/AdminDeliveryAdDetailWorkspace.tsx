"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DeliveryAdCampaignPlacementPreviews } from "@/components/stores/advertising/DeliveryAdCampaignPlacementPreviews";
import {
  adminActionAllowed,
  adminActionRequiresReason,
  type AdminDeliveryAdAction,
  type AdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type {
  AdminDeliveryAdAuditRow,
  AdminDeliveryAdListItem,
} from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  deliveryAdPolicyScreenHref,
} from "@/lib/stores/advertising/delivery-ad-placement-language";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  supportInboxHrefForReference,
  supportInboxHrefForStore,
} from "@/lib/support/support-reference-admin-href";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  getAdminDeliveryAdRequiredDecisionPresentation,
} from "@/lib/stores/advertising/delivery-ad-admin-required-decision";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import {
  DELIVERY_AD_CTA_TARGETS,
  type DeliveryAdCtaTarget,
} from "@/lib/stores/advertising/delivery-ad-creative";
import {
  evaluateDeliveryBannerPublishReadiness,
  isDeliveryBannerCreativeAssetReady,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import { DeliveryAdOperationsPanel } from "@/components/stores/advertising/DeliveryAdOperationsPanel";
import { DeliveryAdOwnerPhoneFrame } from "@/components/stores/advertising/DeliveryAdOwnerPhoneFrame";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";
import {
  adminDeliveryAdFundingStatusLabelKey,
  adminDeliveryAdInventoryAspectLabel,
  adminDeliveryAdInventoryHumanLabel,
  adminDeliveryAdProductLabelKey,
  formatAdminDeliveryAdPriceOrUnset,
  isAdminDeliveryAdPerformanceLifecycle,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
const ACTIONS: AdminDeliveryAdAction[] = [
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "pause",
  "resume",
  "end",
  "terminate",
  "archive",
  "delete_safe_draft",
];

type Props = {
  campaignId: string;
  productHint: AdminDeliveryAdProduct | null;
  focusOperations?: boolean;
  focusCreative?: boolean;
};

export function AdminDeliveryAdDetailWorkspace({
  campaignId,
  productHint,
  focusOperations = false,
  focusCreative = false,
}: Props) {
  const { t, safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<AdminDeliveryAdListItem | null>(null);
  const [audits, setAudits] = useState<AdminDeliveryAdAuditRow[]>([]);
  const [creative, setCreative] = useState<{
    id: string;
    assetPath: string;
    headline: string | null;
    subcopy: string | null;
    version: number;
    ctaLabel: string | null;
    ctaType?: string | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    reviewStatus?: string | null;
    createdAt?: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<AdminDeliveryAdAction | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [editInventoryKey, setEditInventoryKey] = useState<OwnerBannerInventoryKey>("STORES_HOME_HERO");
  const [editCtaType, setEditCtaType] = useState<DeliveryAdCtaTarget>("store_detail");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [placementPreview, setPlacementPreview] =
    useState<DeliveryAdPlacementPreviewPayload | null>(null);
  const [fundingStatus, setFundingStatus] = useState<
    "UNFUNDED" | "FUNDED" | "REFUNDED" | null
  >(null);
  const [fundingPayable, setFundingPayable] = useState<number | null>(null);
  const [fundedAt, setFundedAt] = useState<string | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [fundingExpanded, setFundingExpanded] = useState(false);
  const [ownerCashBalanceMinor, setOwnerCashBalanceMinor] = useState<number | null>(null);
  const [opsExpanded, setOpsExpanded] = useState(false);
  const [perfExpanded, setPerfExpanded] = useState(false);
  const [decisionActionsExpanded, setDecisionActionsExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = productHint ? `?product=${productHint}` : "";
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: AdminDeliveryAdListItem;
        audits?: AdminDeliveryAdAuditRow[];
        creative?: typeof creative;
        placementPreview?: DeliveryAdPlacementPreviewPayload | null;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError(json.error || "load_failed");
        setCampaign(null);
        return;
      }
      setCampaign(json.campaign);
      setAudits(json.audits ?? []);
      setCreative(json.creative ?? null);
      setPlacementPreview(json.placementPreview ?? null);
      setStartAt(json.campaign.startAt.slice(0, 16));
      setEndAt(json.campaign.endAt.slice(0, 16));
      try {
        const fQs = new URLSearchParams({
          campaignId: json.campaign.id,
          product: json.campaign.productKind,
        });
        if (json.campaign.ownerUserId) fQs.set("ownerUserId", json.campaign.ownerUserId);
        if (json.campaign.storeId) fQs.set("storeId", json.campaign.storeId);
        const fRes = await fetch(`/api/admin/delivery-ads/business-cash?${fQs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const fJson = (await fRes.json()) as {
          ok?: boolean;
          businessCash?: { balanceMinor?: number } | null;
          funding?: {
            status?: "UNFUNDED" | "FUNDED" | "REFUNDED";
            fundingStatus?: "UNFUNDED" | "FUNDED" | "REFUNDED";
            amountMinor?: number | null;
            fundedAt?: string | null;
          };
        };
        if (fRes.ok && fJson.ok) {
          if (fJson.funding) {
            setFundingStatus(
              fJson.funding.status ?? fJson.funding.fundingStatus ?? "UNFUNDED"
            );
            setFundingPayable(
              typeof fJson.funding.amountMinor === "number" ? fJson.funding.amountMinor : null
            );
            setFundedAt(fJson.funding.fundedAt ?? null);
          } else {
            setFundingStatus("UNFUNDED");
            setFundingPayable(null);
            setFundedAt(null);
          }
          setOwnerCashBalanceMinor(
            typeof fJson.businessCash?.balanceMinor === "number"
              ? fJson.businessCash.balanceMinor
              : null
          );
        } else {
          setFundingStatus("UNFUNDED");
          setFundingPayable(null);
          setFundedAt(null);
          setOwnerCashBalanceMinor(null);
        }
      } catch {
        setFundingStatus("UNFUNDED");
        setOwnerCashBalanceMinor(null);
      }
      const inv0 = json.campaign.inventoryKeys[0];
      if (
        inv0 &&
        (OWNER_BANNER_INVENTORY_KEYS as readonly string[]).includes(inv0)
      ) {
        setEditInventoryKey(inv0 as OwnerBannerInventoryKey);
      } else {
        setEditInventoryKey("STORES_HOME_HERO");
      }
      const ctaFromCreative = json.creative?.ctaType;
      if (
        ctaFromCreative &&
        (DELIVERY_AD_CTA_TARGETS as readonly string[]).includes(ctaFromCreative)
      ) {
        setEditCtaType(ctaFromCreative as DeliveryAdCtaTarget);
      } else {
        setEditCtaType("store_detail");
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [campaignId, productHint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign) return;
    // R3: do not fetch KPI dashboards during review / draft / scheduled.
    if (!isAdminDeliveryAdPerformanceLifecycle(campaign.lifecycleStatus)) {
      setPerformance(null);
      setPerfLoading(false);
      return;
    }
    let cancelled = false;
    setPerfLoading(true);
    const qs = new URLSearchParams({
      range: perfRange,
      productKind: campaign.productKind,
    });
    void fetch(
      `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/performance?${qs.toString()}`,
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
  }, [campaign, campaignId, perfRange]);

  const allowedActions = useMemo(() => {
    if (!campaign) return [];
    return ACTIONS.filter((a) =>
      adminActionAllowed(a, campaign.lifecycleStatus as DeliveryAdLifecycleStatus)
    );
  }, [campaign]);

  const requiredDecision = useMemo(() => {
    if (!campaign) return null;
    return getAdminDeliveryAdRequiredDecisionPresentation(
      campaign.lifecycleStatus as DeliveryAdLifecycleStatus,
      {
        productKind: campaign.productKind,
        creativeAssetPath: creative?.assetPath || campaign.imageUrl,
      }
    );
  }, [campaign, creative]);

  const secondaryActions = useMemo(() => {
    if (!requiredDecision) return allowedActions;
    const primary = new Set(requiredDecision.primaryReviewActions);
    return allowedActions.filter((a) => !primary.has(a));
  }, [allowedActions, requiredDecision]);

  function decisionToneClass(
    tone: NonNullable<typeof requiredDecision>["tone"]
  ): string {
    if (tone === "urgent") return "border-sam-danger/40 bg-sam-danger/5 text-sam-fg";
    if (tone === "info") return "border-sam-brand/30 bg-sam-brand/5 text-sam-fg";
    return "border-sam-border bg-sam-surface text-sam-fg";
  }

  async function runAction(action: AdminDeliveryAdAction) {
    if (!campaign || busy) return;
    if (adminActionRequiresReason(action) && !reason.trim()) {
      setError("reason_required");
      return;
    }
    const needsConfirm =
      action === "reject" ||
      action === "pause" ||
      action === "end" ||
      action === "terminate" ||
      action === "archive" ||
      action === "delete_safe_draft";
    if (needsConfirm && confirmAction !== action) {
      setConfirmAction(action);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productKind: campaign.productKind,
            action,
            expectedLifecycle: campaign.lifecycleStatus,
            expectedUpdatedAt: campaign.updatedAt,
            reason: reason.trim() || null,
            ownerVisibleNotes: reason.trim() || null,
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          json.error === "funding_required"
            ? t("admin_delivery_ad_funding_required")
            : json.error || "action_failed"
        );
        setConfirmAction(null);
        return;
      }
      setConfirmAction(null);
      setReason("");
      if (action === "delete_safe_draft") {
        router.push(DELIVERY_AD_ADMIN_ROUTES.hub);
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (!campaign || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: campaign.productKind,
          op: "schedule",
          expectedUpdatedAt: campaign.updatedAt,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "update_failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function saveInventory() {
    if (!campaign || busy || campaign.productKind !== "banner") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: campaign.productKind,
          op: "inventory",
          expectedUpdatedAt: campaign.updatedAt,
          inventoryKey: editInventoryKey,
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "update_failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAndReplaceCreative(file: File) {
    if (!campaign || busy || campaign.productKind !== "banner") return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("campaignId", campaignId);
      const upRes = await fetch("/api/admin/delivery-ads/upload-banner-image", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const upJson = (await upRes.json()) as {
        ok?: boolean;
        error?: string;
        url?: string;
        width?: number;
        height?: number;
      };
      if (!upRes.ok || !upJson.ok || !upJson.url) {
        setError(upJson.error || "upload_failed");
        return;
      }
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "banner",
          op: "replace_creative",
          expectedUpdatedAt: campaign.updatedAt,
          assetPath: upJson.url,
          sourceWidth: Number(upJson.width ?? 0),
          sourceHeight: Number(upJson.height ?? 0),
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        setError(json.detail ? `${json.error}:${json.detail}` : json.error || "replace_failed");
        return;
      }
      setFileInputKey((k) => k + 1);
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function removeCreative() {
    if (!campaign || busy || campaign.productKind !== "banner") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "banner",
          op: "remove_creative",
          expectedUpdatedAt: campaign.updatedAt,
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "remove_failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDestination() {
    if (!campaign || busy || campaign.productKind !== "banner") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "banner",
          op: "destination",
          expectedUpdatedAt: campaign.updatedAt,
          ctaType: editCtaType,
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        setError(json.detail ? `${json.error}:${json.detail}` : json.error || "destination_failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  const bannerPublishReady = useMemo(() => {
    if (!campaign || campaign.productKind !== "banner") return null;
    const asset = creative?.assetPath || campaign.imageUrl || "";
    return evaluateDeliveryBannerPublishReadiness({
      creativeAssetPath: asset,
      ctaHref: campaign.ctaHref,
    });
  }, [campaign, creative]);

  useEffect(() => {
    if (!focusCreative || loading || !campaign) return;
    if (campaign.productKind === "banner") {
      router.replace(`${DELIVERY_AD_ADMIN_ROUTES.creative(campaignId)}?product=banner`);
    }
  }, [focusCreative, loading, campaign, campaignId, router]);

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4 pb-10" data-admin-delivery-ads-detail="design-board">
        <div>
          <Link
            href={DELIVERY_AD_ADMIN_ROUTES.hub}
            className="text-[12px] text-sam-brand underline-offset-2 hover:underline"
          >
            ←{" "}
            {safeT("admin_delivery_ads_back", {
              fallbackKo: "목록",
              fallbackEn: "Back",
            })}
          </Link>
          <h1 className="mt-1 text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_detail_title", {
              fallbackKo: "광고 상세",
              fallbackEn: "Campaign detail",
            })}
          </h1>
        </div>

        <AdminDeliveryAdsSectionNav />

        {loading ? (
          <p className="text-[13px] text-sam-muted" role="status">
            {safeT("admin_delivery_ads_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : null}
        {error ? (
          <p className="text-[13px] text-sam-danger" role="alert">
            {error}
          </p>
        ) : null}

        {campaign && requiredDecision ? (
          <>
            {/* A — 지금 해야 할 일 */}
            <section
              className={`rounded-ui-rect border p-4 ${decisionToneClass(requiredDecision.tone)}`}
              data-admin-delivery-ads-detail-section="required-decision"
              data-admin-decision-required={requiredDecision.decisionRequired ? "1" : "0"}
              data-admin-needs-creative={requiredDecision.needsCreativeProduction ? "1" : "0"}
              data-lifecycle={campaign.lifecycleStatus}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wide opacity-80">
                {safeT("admin_delivery_ads_rd_current_status", {
                  fallbackKo: "현재 상태",
                  fallbackEn: "Current status",
                })}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-sam-fg">
                {safeT(
                  `admin_delivery_ads_lifecycle_${campaign.lifecycleStatus.toLowerCase()}` as MessageKey,
                  {
                    fallbackKo: campaign.lifecycleStatus,
                    fallbackEn: campaign.lifecycleStatus,
                  }
                )}
              </p>
              <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide opacity-80">
                {safeT("admin_delivery_ads_rd_section", {
                  fallbackKo: "지금 해야 할 일",
                  fallbackEn: "What to do now",
                })}
              </p>
              <p className="mt-1 text-[16px] font-bold">{t(requiredDecision.titleKey)}</p>
              <p className="mt-2 text-[13px] leading-snug">{t(requiredDecision.bodyKey)}</p>
              {campaign.reviewNotes ? (
                <p className="mt-3 text-[13px] whitespace-pre-wrap break-words">
                  {safeT("admin_delivery_ads_owner_visible_notes", {
                    fallbackKo: "Owner 공개 메모",
                    fallbackEn: "Owner-visible notes",
                  })}
                  : {campaign.reviewNotes}
                </p>
              ) : null}
              {requiredDecision.needsCreativeProduction ? (
                <Link
                  href={`${DELIVERY_AD_ADMIN_ROUTES.creative(campaignId)}?product=banner`}
                  className="mt-3 inline-flex rounded-ui-rect bg-[#0A823E] px-3 py-2 text-[12px] font-semibold text-white"
                  data-admin-delivery-ads-action="produce_banner"
                >
                  {safeT("admin_delivery_ads_creative_produce_cta", {
                    fallbackKo: "배너 제작하기",
                    fallbackEn: "Produce banner",
                  })}
                </Link>
              ) : null}
              {requiredDecision.decisionRequired &&
              requiredDecision.primaryReviewActions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" data-admin-decision-primary-ctas="1">
                  {requiredDecision.primaryReviewActions.map((action) => (
                    <button
                      key={`rd-${action}`}
                      type="button"
                      disabled={
                        busy ||
                        (action === "approve" &&
                          campaign.productKind === "banner" &&
                          bannerPublishReady?.ok === false)
                      }
                      data-admin-delivery-ads-action={action}
                      className={`rounded-ui-rect px-3 py-2 text-[12px] font-medium ${
                        action === "reject"
                          ? "bg-sam-danger text-white"
                          : action === "approve"
                            ? "bg-sam-brand text-white"
                            : "border border-sam-border bg-sam-surface text-sam-fg"
                      }`}
                      onClick={() => void runAction(action)}
                    >
                      {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                        fallbackKo: action,
                        fallbackEn: action,
                      })}
                      {confirmAction === action
                        ? ` · ${safeT("admin_delivery_ads_confirm_again", {
                            fallbackKo: "다시 눌러 확인",
                            fallbackEn: "Tap again to confirm",
                          })}`
                        : ""}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="mt-3 flex flex-col gap-1 text-[12px]">
                {safeT("admin_delivery_ads_reason", {
                  fallbackKo: "사유 (수정요청·거절·중지·강제중단 필수)",
                  fallbackEn: "Reason (required for changes/reject/pause/terminate)",
                })}
                <textarea
                  className="min-h-[72px] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-admin-delivery-ads-reason="1"
                />
              </label>
            </section>

            {/* B + E — 신청 요약 | 고객 노출 미리보기 (design board split) */}
            <div
              className="grid gap-4 lg:grid-cols-2"
              data-admin-delivery-ads-detail-split="design-board"
            >
              <div className="space-y-4">
              <div data-admin-delivery-ads-detail-section="application">
                <AdminCard titleKey="admin_delivery_ads_section_application">
                  <dl className="grid gap-2 text-[13px]" data-admin-delivery-ads-detail-section="facts">
                  <div>
                    <dt className="text-sam-muted">
                      {safeT("admin_delivery_ads_product_label", {
                        fallbackKo: "상품",
                        fallbackEn: "Product",
                      })}
                    </dt>
                    <dd>
                      {safeT(adminDeliveryAdProductLabelKey(campaign.productKind), {
                        fallbackKo: campaign.productKind,
                        fallbackEn: campaign.productKind,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Store</dt>
                    <dd>{campaign.storeName || campaign.storeId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Owner</dt>
                    <dd>{campaign.ownerDisplayName || campaign.ownerUserId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">
                      {safeT("admin_delivery_ads_inventory_label", {
                        fallbackKo: "광고 지면",
                        fallbackEn: "Placement",
                      })}
                    </dt>
                    <dd>
                      {(campaign.inventoryKeys ?? [])
                        .map((k) => adminDeliveryAdInventoryHumanLabel(k, lang))
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Lifecycle</dt>
                    <dd>
                      {safeT(
                        `admin_delivery_ads_lifecycle_${campaign.lifecycleStatus.toLowerCase()}` as MessageKey,
                        {
                          fallbackKo: campaign.lifecycleStatus,
                          fallbackEn: campaign.lifecycleStatus,
                        }
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Period</dt>
                    <dd className="text-sam-muted">
                      {campaign.startAt.slice(0, 16)} ~ {campaign.endAt.slice(0, 16)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 break-all font-mono text-[11px] text-sam-muted">ID {campaign.id}</p>
              </AdminCard>
              </div>

            {/* C — 결제 (collapsed by default) */}
            <div data-admin-delivery-ads-detail-section="funding">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-semibold text-sam-fg"
                onClick={() => setFundingExpanded((v) => !v)}
              >
                {safeT("admin_delivery_ads_section_funding_title", {
                  fallbackKo: "결제",
                  fallbackEn: "Funding",
                })}
                <span>{fundingExpanded ? "−" : "+"}</span>
              </button>
              {fundingExpanded ? (
              <AdminCard titleKey="admin_delivery_ads_section_funding_title">
                <div data-admin-delivery-ads-funding="1" className="space-y-2 text-[13px] text-sam-fg">
                  <p>
                    {t("admin_delivery_ads_funding_status")}:{" "}
                    {t(adminDeliveryAdFundingStatusLabelKey(fundingStatus))}
                    {" · "}
                    {t("admin_delivery_ads_funding_payable")}:{" "}
                    {formatAdminDeliveryAdPriceOrUnset(fundingPayable, lang)}
                    {fundedAt ? ` · ${fundedAt.slice(0, 16)}` : ""}
                  </p>
                  <p data-admin-business-cash-balance="1">
                    {safeT("admin_delivery_ads_owner_cash_balance", {
                      fallbackKo: "매장 Cash 잔액",
                      fallbackEn: "Store Cash balance",
                    })}
                    :{" "}
                    {ownerCashBalanceMinor == null
                      ? "—"
                      : formatAdminDeliveryAdPriceOrUnset(ownerCashBalanceMinor, lang)}
                  </p>
                  {fundingStatus !== "FUNDED" ? (
                    <p className="text-[12px] text-amber-800">
                      {t("admin_delivery_ad_funding_required")}
                    </p>
                  ) : null}
                  <div
                    className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app p-3"
                    data-admin-business-cash-credit="1"
                    data-admin-ast005-authority="1"
                  >
                    <p className="text-[12px] font-semibold text-sam-fg">
                      {safeT("admin_delivery_ads_cash_credit_title", {
                        fallbackKo: "광고 결제 = Cash",
                        fallbackEn: "Ads payment = Cash",
                      })}
                    </p>
                    <p className="mt-1 text-[11px] text-sam-muted">
                      {safeT("admin_delivery_ads_cash_credit_note", {
                        fallbackKo:
                          "광고비는 신청 시 Cash에서 확보됩니다. Admin은 금액을 수정할 수 없습니다. 결제만으로 ACTIVE 되지 않습니다.",
                        fallbackEn:
                          "Ad fees are secured from Cash at submit. Admins cannot edit the amount. Payment alone never goes ACTIVE.",
                      })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {campaign.storeId ? (
                        <Link
                          href={`/admin/finance?storeId=${encodeURIComponent(campaign.storeId)}`}
                          className="min-h-[36px] inline-flex items-center rounded-ui-rect border border-[var(--currency-cash-border)] bg-sam-surface px-3 text-[12px] font-semibold text-[var(--currency-cash-accent)]"
                          data-admin-delivery-ads-finance-link="1"
                        >
                          {safeT("admin_delivery_ads_open_store_finance", {
                            fallbackKo: "매장 Cash/Coin 보기",
                            fallbackEn: "Open store Cash/Coin",
                          })}
                        </Link>
                      ) : null}
                      <Link
                        href="/admin/delivery-ads/cash-charges"
                        className="min-h-[36px] inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[12px] font-semibold text-sam-fg"
                        data-admin-delivery-ads-cash-queue-link="1"
                      >
                        {safeT("admin_delivery_ads_open_cash_queue", {
                          fallbackKo: "Cash 충전 대기열",
                          fallbackEn: "Cash top-up queue",
                        })}
                      </Link>
                    </div>
                  </div>
                </div>
              </AdminCard>
              ) : null}
            </div>
              </div>

              <div data-admin-delivery-ads-detail-section="preview">
                <AdminCard titleKey="admin_delivery_ads_section_preview">
                  <DeliveryAdOwnerPhoneFrame
                    label={safeT("admin_delivery_ads_section_preview", {
                      fallbackKo: "고객 노출 미리보기",
                      fallbackEn: "Customer preview",
                    })}
                  >
                    <DeliveryAdCampaignPlacementPreviews
                      productKind={campaign.productKind}
                      inventoryKeys={campaign.inventoryKeys}
                      renderContext="admin_preview"
                      placementPreview={placementPreview}
                      bannerCreative={
                        campaign.productKind === "banner"
                          ? {
                              assetUrl: creative?.assetPath || campaign.imageUrl || "",
                              headline: creative?.headline ?? campaign.title,
                              subcopy: creative?.subcopy ?? campaign.headline,
                              alt: campaign.title || "banner",
                            }
                          : null
                      }
                      ctaLabel={creative?.ctaLabel ?? null}
                      destinationHref={campaign.ctaHref}
                    />
                  </DeliveryAdOwnerPhoneFrame>
                  {bannerPublishReady ? (
                    <p className="mt-2 text-[12px] text-sam-muted">
                      {bannerPublishReady.ok
                        ? safeT("admin_delivery_ads_publish_ready", {
                            fallbackKo: "승인 가능: 제작·목적지 준비됨",
                            fallbackEn: "Approve-ready: creative & destination OK",
                          })
                        : safeT("admin_delivery_ads_publish_blocked", {
                            fallbackKo: `승인 차단: ${bannerPublishReady.reasons.join(", ")}`,
                            fallbackEn: `Approve blocked: ${bannerPublishReady.reasons.join(", ")}`,
                          })}
                    </p>
                  ) : null}
                </AdminCard>
              </div>
            </div>

            {/* D — 배너 스튜디오 링크 (UI-2 standalone studio) */}
            {campaign.productKind === "banner" ? (
              <div
                data-admin-delivery-ads-detail-section="creative"
                data-admin-delivery-ad-creative="studio-link"
              >
                <AdminCard titleKey="admin_delivery_ads_section_creative_produce">
                  <p
                    className="text-[13px] text-sam-fg"
                    data-creative-title="produce"
                  >
                    {isDeliveryBannerCreativeAssetReady(creative?.assetPath || campaign.imageUrl)
                      ? safeT("admin_delivery_ads_creative_status_ready", {
                          fallbackKo: "제작 완료",
                          fallbackEn: "Ready",
                        })
                      : safeT("admin_delivery_ads_creative_status_needs_production", {
                          fallbackKo: "제작 필요",
                          fallbackEn: "Needs production",
                        })}
                  </p>
                  <Link
                    href={`${DELIVERY_AD_ADMIN_ROUTES.creative(campaignId)}?product=banner`}
                    className="mt-3 inline-flex min-h-[44px] items-center rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white"
                    data-admin-delivery-ads-creative-studio-link="1"
                  >
                    {safeT("admin_delivery_ads_creative_produce_cta", {
                      fallbackKo: "배너 제작 스튜디오 열기",
                      fallbackEn: "Open banner studio",
                    })}
                  </Link>
                </AdminCard>
              </div>
            ) : null}

            {/* F — decision actions (collapsed by default) */}
            <div data-admin-delivery-ads-detail-section="decision-actions">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-semibold text-sam-fg"
                onClick={() => setDecisionActionsExpanded((v) => !v)}
              >
                {safeT("admin_delivery_ads_section_decision_actions", {
                  fallbackKo: "추가 검수 액션",
                  fallbackEn: "Additional review actions",
                })}
                <span>{decisionActionsExpanded ? "−" : "+"}</span>
              </button>
              {decisionActionsExpanded ? (
              <AdminCard titleKey="admin_delivery_ads_section_decision_actions">
                <div className="flex flex-wrap gap-2">
                  {(requiredDecision.decisionRequired
                    ? requiredDecision.primaryReviewActions
                    : allowedActions
                  ).map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={
                        busy ||
                        (action === "approve" &&
                          campaign.productKind === "banner" &&
                          bannerPublishReady?.ok === false)
                      }
                      data-admin-delivery-ads-action={action}
                      className={`rounded-ui-rect px-3 py-2 text-[12px] font-medium ${
                        action === "terminate" ||
                        action === "reject" ||
                        action === "delete_safe_draft"
                          ? "bg-sam-danger text-white"
                          : action === "approve"
                            ? "bg-sam-brand text-white"
                            : "border border-sam-border bg-sam-surface text-sam-fg"
                      }`}
                      onClick={() => void runAction(action)}
                    >
                      {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                        fallbackKo: action,
                        fallbackEn: action,
                      })}
                      {confirmAction === action
                        ? ` · ${safeT("admin_delivery_ads_confirm_again", {
                            fallbackKo: "다시 눌러 확인",
                            fallbackEn: "Tap again to confirm",
                          })}`
                        : ""}
                    </button>
                  ))}
                </div>
                {requiredDecision.decisionRequired && secondaryActions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-sam-border pt-3">
                    {secondaryActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={busy}
                        data-admin-delivery-ads-action={action}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-medium text-sam-fg"
                        onClick={() => void runAction(action)}
                      >
                        {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                          fallbackKo: action,
                          fallbackEn: action,
                        })}
                        {confirmAction === action
                          ? ` · ${safeT("admin_delivery_ads_confirm_again", {
                              fallbackKo: "다시 눌러 확인",
                              fallbackEn: "Tap again to confirm",
                            })}`
                          : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
              </AdminCard>
              ) : null}
            </div>

            {/* G — Support cases (customer inquiries) vs Ops thread (product ops) — MUST stay separate */}
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-admin-delivery-ads-detail-section="support"
              data-admin-delivery-ads-support-ops-split="1"
            >
              <p className="text-[12px] font-semibold text-sam-fg">
                {safeT("admin_delivery_ads_related_support_title", {
                  fallbackKo: "관련 문의 (Support)",
                  fallbackEn: "Related Support cases",
                })}
              </p>
              <p className="mt-1 text-[11px] text-sam-muted">
                {safeT("admin_delivery_ads_related_support_note", {
                  fallbackKo:
                    "고객지원 문의입니다. 광고 승인/중지는 아래 운영 대화가 아니라 Ads lifecycle에서 처리합니다.",
                  fallbackEn:
                    "Customer support cases. Approve/pause ads via Ads lifecycle — not this Support inbox.",
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={supportInboxHrefForReference(campaign.id)}
                  className="min-h-[36px] inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-app px-3 text-[12px] font-semibold text-sam-fg"
                  data-admin-delivery-ads-support-link="1"
                >
                  {safeT("admin_delivery_ads_open_related_support", {
                    fallbackKo: "관련 문의 열기",
                    fallbackEn: "Open related Support",
                  })}
                </Link>
                {campaign.storeId ? (
                  <Link
                    href={supportInboxHrefForStore(campaign.storeId)}
                    className="min-h-[36px] inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-app px-3 text-[12px] font-semibold text-sam-fg"
                    data-admin-delivery-ads-store-support-link="1"
                  >
                    {safeT("admin_delivery_ads_open_store_support", {
                      fallbackKo: "매장 Support 보기",
                      fallbackEn: "Store Support inbox",
                    })}
                  </Link>
                ) : null}
              </div>
            </div>

            {/* G2 — ops conversation (collapsed by default) — PRODUCT OPS THREAD ≠ Support case */}
            <div data-admin-delivery-ads-detail-section="operations">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-semibold text-sam-fg"
                onClick={() => setOpsExpanded((v) => !v)}
              >
                {safeT("admin_delivery_ads_section_operations", {
                  fallbackKo: "운영 대화 (Ops)",
                  fallbackEn: "Ops conversation",
                })}
                <span>{opsExpanded ? "−" : "+"}</span>
              </button>
              {opsExpanded ? (
              <div
                className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:p-5"
              >
              <DeliveryAdOperationsPanel
                actorRole="admin"
                productKind={campaign.productKind}
                campaignId={campaign.id}
                focusOperations={focusOperations}
              />
              </div>
              ) : null}
            </div>

            {/* H — schedule / settings */}
            <div data-admin-delivery-ads-detail-section="settings">
              <AdminCard titleKey="admin_delivery_ads_section_settings">
                {campaign.productKind === "banner" ? (
                  <div className="mb-3 space-y-2">
                    <label className="flex flex-col gap-1 text-[12px]">
                      {safeT("admin_delivery_ads_inventory_label", {
                        fallbackKo: "광고 지면",
                        fallbackEn: "Placement",
                      })}
                      <select
                        className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
                        value={editInventoryKey}
                        onChange={(e) =>
                          setEditInventoryKey(e.target.value as OwnerBannerInventoryKey)
                        }
                        disabled={busy}
                      >
                        {OWNER_BANNER_INVENTORY_KEYS.map((key) => (
                          <option key={key} value={key}>
                            {adminDeliveryAdInventoryHumanLabel(key, lang)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                      onClick={() => void saveInventory()}
                    >
                      {safeT("admin_delivery_ads_save_inventory", {
                        fallbackKo: "지면 저장",
                        fallbackEn: "Save placement",
                      })}
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app p-3">
                  <p className="text-[12px] font-bold text-sam-fg">
                    {t("admin_delivery_ads_policy_section")}
                  </p>
                  <ul className="mt-2 space-y-2 text-[12px] text-sam-fg">
                    {(campaign.inventoryKeys.length
                      ? campaign.inventoryKeys
                      : [editInventoryKey]
                    ).map((key) => {
                      const href = deliveryAdPolicyScreenHref(key, {
                        primarySlug: campaign.storePrimarySlug,
                        subSlug: campaign.storeSubSlug,
                      });
                      const label = adminDeliveryAdInventoryHumanLabel(key, lang);
                      return (
                        <li key={key} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{label}</span>
                          <Link
                            href={placementMapFocusHref(key, { campaignId })}
                            className="text-signature underline underline-offset-2"
                            data-admin-ads-placement-map-link={key}
                          >
                            {safeT("admin_delivery_ads_view_app_placement", {
                              fallbackKo: "앱 위치 보기",
                              fallbackEn: "View app placement",
                            })}
                          </Link>
                          {href ? (
                            <Link
                              href={href}
                              className="text-signature underline underline-offset-2"
                            >
                              {key === "STORES_CATEGORY_FEED" || key === "STORES_CATEGORY_TOP"
                                ? t("admin_delivery_ads_policy_view_browse")
                                : t("admin_delivery_ads_policy_view_home")}
                            </Link>
                          ) : (
                            <span className="text-sam-muted">
                              {t("admin_delivery_ads_policy_no_screen")}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="flex flex-1 flex-col gap-1 text-[12px]">
                    Start
                    <input
                      type="datetime-local"
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[12px]">
                    End
                    <input
                      type="datetime-local"
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                  onClick={() => void saveSchedule()}
                >
                  {safeT("admin_delivery_ads_save_schedule", {
                    fallbackKo: "일정 저장",
                    fallbackEn: "Save schedule",
                  })}
                </button>
              </AdminCard>
            </div>

            {/* I — performance ONLY ACTIVE/ENDED */}
            {isAdminDeliveryAdPerformanceLifecycle(campaign.lifecycleStatus) ? (
              <div data-admin-delivery-ads-detail-section="performance">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-semibold text-sam-fg"
                  onClick={() => setPerfExpanded((v) => !v)}
                >
                  {safeT("admin_delivery_ads_section_performance", {
                    fallbackKo: "성과",
                    fallbackEn: "Performance",
                  })}
                  <span>{perfExpanded ? "−" : "+"}</span>
                </button>
                {perfExpanded ? (
                <AdminCard titleKey="admin_delivery_ads_section_performance">
                  <DeliveryAdPerformancePanel
                    performance={performance}
                    loading={perfLoading}
                    range={perfRange}
                    onRangeChange={setPerfRange}
                  />
                </AdminCard>
                ) : null}
              </div>
            ) : null}

            {/* J — audit collapsed */}
            <div data-admin-delivery-ads-detail-section="history">
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <button
                  type="button"
                  className="text-[13px] font-semibold text-sam-fg underline-offset-2 hover:underline"
                  data-admin-delivery-ads-audit-toggle="1"
                  aria-expanded={auditExpanded}
                  onClick={() => setAuditExpanded((v) => !v)}
                >
                  {auditExpanded
                    ? safeT("admin_delivery_ads_audit_hide", {
                        fallbackKo: "변경 기록 숨기기",
                        fallbackEn: "Hide change history",
                      })
                    : safeT("admin_delivery_ads_audit_collapsed", {
                        fallbackKo: "변경 기록 보기",
                        fallbackEn: "Show change history",
                      })}
                </button>
                {auditExpanded ? (
                  <div className="mt-3">
                    {audits.length === 0 ? (
                      <p className="text-[13px] text-sam-muted">—</p>
                    ) : (
                      <ul className="space-y-2">
                        {audits.map((a) => (
                          <li
                            key={a.id}
                            className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[12px]"
                          >
                            <div className="font-medium text-sam-fg">
                              {a.action} · {a.actorType}
                            </div>
                            <div className="text-sam-muted">{a.createdAt}</div>
                            {a.reason ? (
                              <div className="mt-0.5 text-sam-fg">{a.reason}</div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
