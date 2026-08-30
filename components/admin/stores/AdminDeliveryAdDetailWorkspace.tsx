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
  deliveryAdPlacementI18nKey,
  deliveryAdPolicyScreenHref,
} from "@/lib/stores/advertising/delivery-ad-placement-language";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
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
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";

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
};

export function AdminDeliveryAdDetailWorkspace({
  campaignId,
  productHint,
  focusOperations = false,
}: Props) {
  const { t, safeT } = useI18n();
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
        const fRes = await fetch(`/api/admin/delivery-ads/business-cash?${fQs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const fJson = (await fRes.json()) as {
          ok?: boolean;
          funding?: {
            fundingStatus?: "UNFUNDED" | "FUNDED" | "REFUNDED";
            amountMinor?: number | null;
            fundedAt?: string | null;
          };
        };
        if (fRes.ok && fJson.ok && fJson.funding) {
          setFundingStatus(fJson.funding.fundingStatus ?? "UNFUNDED");
          setFundingPayable(
            typeof fJson.funding.amountMinor === "number" ? fJson.funding.amountMinor : null
          );
          setFundedAt(fJson.funding.fundedAt ?? null);
        } else {
          setFundingStatus("UNFUNDED");
          setFundingPayable(null);
          setFundedAt(null);
        }
      } catch {
        setFundingStatus("UNFUNDED");
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
      campaign.lifecycleStatus as DeliveryAdLifecycleStatus
    );
  }, [campaign]);

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

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4 pb-10" data-admin-delivery-ads-detail="1">
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
            <div data-admin-delivery-ads-detail-section="identity">
              <AdminCard titleKey="admin_delivery_ads_section_basic">
                <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-sam-muted">ID</dt>
                    <dd className="break-all font-mono text-[12px]">{campaign.id}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">
                      {safeT("admin_delivery_ads_product_label", {
                        fallbackKo: "상품",
                        fallbackEn: "Product",
                      })}
                    </dt>
                    <dd>
                      {safeT(
                        `admin_delivery_ads_product_${campaign.productKind}` as MessageKey,
                        {
                          fallbackKo: campaign.productKind,
                          fallbackEn: campaign.productKind,
                        }
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Owner</dt>
                    <dd>{campaign.ownerDisplayName || campaign.ownerUserId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Store</dt>
                    <dd>{campaign.storeName || campaign.storeId || "—"}</dd>
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
                      {campaign.scheduleHint !== "in_window" ? (
                        <span className="ml-2 text-[11px] text-sam-muted">
                          ({campaign.scheduleHint})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">Review</dt>
                    <dd>{campaign.reviewStatus}</dd>
                  </div>
                </dl>
              </AdminCard>
            </div>

            <section
              className={`rounded-ui-rect border p-4 ${decisionToneClass(requiredDecision.tone)}`}
              data-admin-delivery-ads-detail-section="required-decision"
              data-admin-decision-required={requiredDecision.decisionRequired ? "1" : "0"}
              data-lifecycle={campaign.lifecycleStatus}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wide opacity-80">
                {t("admin_delivery_ads_rd_section")}
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

            <div data-admin-delivery-ads-detail-section="facts">
              <AdminCard titleKey="admin_delivery_ads_section_facts">
                <p className="text-[13px] text-sam-fg">
                  {safeT("admin_delivery_ads_inventory_label", {
                    fallbackKo: "광고 지면",
                    fallbackEn: "Placement",
                  })}
                  :{" "}
                  {(campaign.inventoryKeys ?? [])
                    .map((k) => t(deliveryAdPlacementI18nKey(k) as MessageKey))
                    .join(" · ") || "—"}
                </p>
                <p className="mt-2 text-[13px] text-sam-muted">
                  {campaign.startAt.slice(0, 16)} ~ {campaign.endAt.slice(0, 16)}
                </p>
                <p className="mt-2 text-[13px] text-sam-muted">
                  {safeT("admin_delivery_ads_pricing_not_configured", {
                    fallbackKo: "과금: NOT_CONFIGURED (CUT H 이전)",
                    fallbackEn: "Pricing: NOT_CONFIGURED (before CUT H)",
                  })}
                </p>
                <p className="mt-3 text-[13px] text-sam-fg" data-admin-delivery-ads-funding="1">
                  {t("admin_delivery_ads_funding_section")}:{" "}
                  {fundingStatus === "FUNDED"
                    ? t("admin_delivery_ads_funding_funded")
                    : fundingStatus === "REFUNDED"
                      ? t("admin_delivery_ads_funding_refunded")
                      : t("admin_delivery_ads_funding_unfunded")}
                  {fundingPayable != null
                    ? ` · ${t("admin_delivery_ads_funding_payable")} ${fundingPayable}`
                    : ""}
                  {fundedAt ? ` · ${fundedAt.slice(0, 16)}` : ""}
                </p>
                {fundingStatus !== "FUNDED" ? (
                  <p className="mt-1 text-[12px] text-amber-800">
                    {t("admin_delivery_ad_funding_required")}
                  </p>
                ) : null}
              </AdminCard>
            </div>

            {campaign.productKind === "banner" ? (
              <div data-admin-delivery-ads-detail-section="creative">
                <AdminCard titleKey="admin_delivery_ads_section_creative">
                  <p className="text-[13px] font-medium text-sam-fg">
                    {safeT("admin_delivery_ads_creative_status_label", {
                      fallbackKo: "제작 상태",
                      fallbackEn: "Creative status",
                    })}
                    :{" "}
                    {isDeliveryBannerCreativeAssetReady(
                      creative?.assetPath || campaign.imageUrl
                    )
                      ? safeT("admin_delivery_ads_creative_status_ready", {
                          fallbackKo: "제작 완료",
                          fallbackEn: "Ready",
                        })
                      : safeT("admin_delivery_ads_creative_status_needs_production", {
                          fallbackKo: "제작 필요",
                          fallbackEn: "Needs production",
                        })}
                  </p>
                  {isDeliveryBannerCreativeAssetReady(
                    creative?.assetPath || campaign.imageUrl
                  ) ? (
                    <div className="relative mt-3 h-[160px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                      <SamarketThumbnail
                        src={String(creative?.assetPath || campaign.imageUrl || "")}
                        alt=""
                        fill
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-sam-muted">
                      {safeT("admin_delivery_ads_creative_placeholder_hint", {
                        fallbackKo:
                          "Owner 요청만 있습니다. Admin이 최종 배너 이미지를 업로드해야 합니다.",
                        fallbackEn:
                          "Owner request only. Admin must upload the final banner image.",
                      })}
                    </p>
                  )}
                  {creative?.sourceWidth && creative?.sourceHeight ? (
                    <p className="mt-2 text-[12px] text-sam-muted">
                      {creative.sourceWidth}×{creative.sourceHeight}
                      {creative.createdAt ? ` · ${creative.createdAt.slice(0, 16)}` : ""}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-medium text-sam-fg">
                      {safeT("admin_delivery_ads_creative_upload", {
                        fallbackKo: "이미지 업로드",
                        fallbackEn: "Upload image",
                      })}
                      <input
                        key={fileInputKey}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadAndReplaceCreative(f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px]"
                      onClick={() => {
                        const el = document.createElement("input");
                        el.type = "file";
                        el.accept = "image/jpeg,image/png,image/webp";
                        el.onchange = () => {
                          const f = el.files?.[0];
                          if (f) void uploadAndReplaceCreative(f);
                        };
                        el.click();
                      }}
                    >
                      {safeT("admin_delivery_ads_creative_replace", {
                        fallbackKo: "이미지 교체",
                        fallbackEn: "Replace image",
                      })}
                    </button>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !isDeliveryBannerCreativeAssetReady(
                          creative?.assetPath || campaign.imageUrl
                        )
                      }
                      className="rounded-ui-rect border border-sam-danger/40 px-3 py-2 text-[12px] text-sam-danger"
                      onClick={() => void removeCreative()}
                    >
                      {safeT("admin_delivery_ads_creative_remove", {
                        fallbackKo: "이미지 삭제",
                        fallbackEn: "Remove image",
                      })}
                    </button>
                  </div>
                </AdminCard>
              </div>
            ) : null}

            {campaign.productKind === "banner" ? (
              <div data-admin-delivery-ads-detail-section="destination">
                <AdminCard titleKey="admin_delivery_ads_section_destination">
                  <p className="text-[13px] text-sam-fg">
                    {safeT("admin_delivery_ads_destination_help", {
                      fallbackKo: "배너를 누르면 이동할 위치",
                      fallbackEn: "Where the banner tap should go",
                    })}
                  </p>
                  <label className="mt-3 flex flex-col gap-1 text-[12px]">
                    {safeT("admin_delivery_ads_destination_type", {
                      fallbackKo: "이동 위치",
                      fallbackEn: "Destination",
                    })}
                    <select
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
                      value={editCtaType}
                      disabled={busy}
                      onChange={(e) => setEditCtaType(e.target.value as DeliveryAdCtaTarget)}
                    >
                      <option value="store_detail">
                        {safeT("owner_ads_banner_cta_store", {
                          fallbackKo: "매장 상세",
                          fallbackEn: "Store detail",
                        })}
                      </option>
                      <option value="store_menu">
                        {safeT("owner_ads_banner_cta_menu", {
                          fallbackKo: "메뉴",
                          fallbackEn: "Menu",
                        })}
                      </option>
                      <option value="store_promotion">
                        {safeT("owner_ads_banner_cta_promo", {
                          fallbackKo: "프로모션",
                          fallbackEn: "Promotion",
                        })}
                      </option>
                    </select>
                  </label>
                  {campaign.ctaHref ? (
                    <p className="mt-2 break-all text-[12px] text-sam-muted">{campaign.ctaHref}</p>
                  ) : (
                    <p className="mt-2 text-[12px] text-sam-danger">
                      {safeT("admin_delivery_ads_destination_missing", {
                        fallbackKo: "목적지가 비어 있습니다.",
                        fallbackEn: "Destination is empty.",
                      })}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-3 rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                    onClick={() => void saveDestination()}
                  >
                    {safeT("admin_delivery_ads_destination_save", {
                      fallbackKo: "목적지 확정 저장",
                      fallbackEn: "Save destination",
                    })}
                  </button>
                </AdminCard>
              </div>
            ) : null}

            <div data-admin-delivery-ads-detail-section="preview">
              <AdminCard titleKey="admin_delivery_ads_section_preview">
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
                {creative ? (
                  <p className="mt-2 text-[11px] text-sam-muted">
                    creative v{creative.version} · {creative.id.slice(0, 8)}
                  </p>
                ) : null}
              </AdminCard>
            </div>

            <div data-admin-delivery-ads-detail-section="decision-actions">
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
            </div>

            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:p-5"
              data-admin-delivery-ads-detail-section="operations"
            >
              <p className="mb-2 text-[13px] font-semibold text-sam-fg">
                {t("admin_delivery_ads_section_operations")}
              </p>
              <DeliveryAdOperationsPanel
                actorRole="admin"
                productKind={campaign.productKind}
                campaignId={campaign.id}
                focusOperations={focusOperations}
              />
            </div>

            <div data-admin-delivery-ads-detail-section="history">
              <AdminCard titleKey="admin_delivery_ads_section_history">
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
                        {a.reason ? <div className="mt-0.5 text-sam-fg">{a.reason}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </AdminCard>
            </div>

            <div data-admin-delivery-ads-detail-section="performance">
              <AdminCard titleKey="admin_delivery_ads_section_performance">
                <DeliveryAdPerformancePanel
                  performance={performance}
                  loading={perfLoading}
                  range={perfRange}
                  onRangeChange={setPerfRange}
                />
              </AdminCard>
            </div>

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
                            {key === "STORES_SEARCH_TOP"
                              ? safeT("owner_ads_inventory_search_top", {
                                  fallbackKo: "검색 결과 상단",
                                  fallbackEn: "Search results top",
                                })
                              : safeT("owner_ads_inventory_home_hero", {
                                  fallbackKo: "배달 홈 히어로",
                                  fallbackEn: "Delivery home hero",
                                })}
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
                      const label = t(deliveryAdPlacementI18nKey(key) as MessageKey);
                      return (
                        <li key={key} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{label}</span>
                          {href ? (
                            <Link
                              href={href}
                              className="text-signature underline underline-offset-2"
                            >
                              {key === "STORES_CATEGORY_FEED"
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
          </>
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
