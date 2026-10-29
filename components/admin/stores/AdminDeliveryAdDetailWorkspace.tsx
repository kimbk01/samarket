"use client";

import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
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
import { adsWorkspaceMutationConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import type { WorkspaceDrawerAction } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
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
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { AdminErrorState } from "@/components/admin/ui/AdminStateViews";
import { adsRemainingPeriodLabel } from "@/lib/admin/domain-control/ads-operator-cta";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";

const REVIEW_CONFIRM_ACTIONS = new Set<AdminDeliveryAdAction>([
  "approve",
  "reject",
  "request_changes",
]);

function deliveryReviewToWorkspaceAction(
  action: AdminDeliveryAdAction
): WorkspaceDrawerAction | null {
  if (action === "approve") return "approve";
  if (action === "reject") return "reject";
  if (action === "request_changes") return "request_changes";
  return null;
}

/** 심사 결정 → 확인 단계 동작 표 (R2): 승인 = approve(L2) · 반려·수정 요청 = reject(L2) — 사유는 API `reason` 으로 전송. */
function deliveryReviewConfirmKind(action: AdminDeliveryAdAction): AdminActionKind {
  return action === "approve" ? "approve" : "reject";
}

/**
 * 운영 조치 → 확인 단계 동작 표 (R2). 예전 「두 번 눌러 확인」·행 안 사유 입력을 confirmAdminAction 하나로 바꾼다.
 * - 일시 중지: 서버 계약이 사유 필수(`adminActionRequiresReason` → reason_required) → 사유를 받는 sanction(L2)
 * - 종료: exposeStop(L1) · 보관: disable(L1)
 * - 강제 종료: forceCancel(L3, 사유 필수 계약 유지 + 광고 이름 재입력) · 초안 삭제: delete(L3, 사유 → 삭제 감사 reason)
 * 사유는 기존 API 본문 `reason`(+ ownerVisibleNotes) 으로 보낸다 — 서버 계약 변경 없음.
 */
const DELIVERY_AD_OPS_CONFIRM: Partial<
  Record<
    AdminDeliveryAdAction,
    { kind: AdminActionKind; titleKo: string; titleEn: string; descKo: string; descEn: string; destructive: boolean }
  >
> = {
  pause: {
    kind: "sanction",
    titleKo: "이 광고를 일시 중지할까요?",
    titleEn: "Pause this ad?",
    descKo: "고객 화면 노출이 멈춥니다. 「재개」로 다시 노출할 수 있습니다.",
    descEn: "The ad stops showing to customers. You can resume it later.",
    destructive: true,
  },
  end: {
    kind: "exposeStop",
    titleKo: "이 광고를 종료할까요?",
    titleEn: "End this ad?",
    descKo: "광고 노출을 마칩니다.",
    descEn: "The ad stops showing.",
    destructive: true,
  },
  terminate: {
    kind: "forceCancel",
    titleKo: "이 광고를 강제 종료할까요?",
    titleEn: "Force-end this ad?",
    descKo: "되돌릴 수 없습니다. 노출이 즉시 끝납니다.",
    descEn: "This cannot be undone. The ad stops showing immediately.",
    destructive: true,
  },
  archive: {
    kind: "disable",
    titleKo: "이 광고를 보관할까요?",
    titleEn: "Archive this ad?",
    descKo: "보관 상태로 옮깁니다.",
    descEn: "The ad moves to the archive.",
    destructive: false,
  },
  delete_safe_draft: {
    kind: "delete",
    titleKo: "이 초안을 삭제할까요?",
    titleEn: "Delete this draft?",
    descKo: "되돌릴 수 없습니다. 작성 중인 광고 초안이 삭제됩니다.",
    descEn: "This cannot be undone. The draft ad is deleted.",
    destructive: true,
  },
};

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
  // IA-07/AD-06: 광고 조치·저장·연장 = 서버 `business` 키 (접근표 /admin/delivery-ads action) — 서버 가드가 최종 판정
  const writeAction = useAdminRouteAction("/admin/delivery-ads");
  const writeBlocked = !writeAction.allowed;
  const writeBlockedTitle = writeAction.reason ?? undefined;
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
  const [reviewSuccessKind, setReviewSuccessKind] = useState<
    "approve" | "reject" | "request_changes" | null
  >(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [editInventoryKey, setEditInventoryKey] = useState<OwnerBannerInventoryKey>("STORES_HOME_HERO");
  const [editCtaType, setEditCtaType] = useState<DeliveryAdCtaTarget>("store_detail");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  /** v4 UI-12: 성과 조회 실패 = 오류 상태 (빈 상태로 보이지 않게) */
  const [perfError, setPerfError] = useState<{ code: string; status?: number } | null>(null);
  const [perfReloadKey, setPerfReloadKey] = useState(0);
  /** v4 UI-09: 결제 조회 실패 = 「미결제」가 아니라 조회 실패 */
  const [fundingLoadError, setFundingLoadError] = useState<{ code: string; status?: number } | null>(null);
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
  const [extendDays, setExtendDays] = useState(7);
  const [extendKind, setExtendKind] = useState<"PAID" | "ADMIN_FREE_COMPENSATION">("PAID");
  const [extendReason, setExtendReason] = useState("");
  const [extendQuote, setExtendQuote] = useState<{
    amountMinor: number;
    currency: string;
    previousEndAt: string;
    newEndAt: string;
    daysAdded: number;
  } | null>(null);
  const [extendBusy, setExtendBusy] = useState(false);

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
      setStartAt(adminIsoToManilaInput(json.campaign.startAt));
      setEndAt(adminIsoToManilaInput(json.campaign.endAt));
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
        const fJson = (await fRes.json().catch(() => ({}))) as {
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
          setFundingLoadError(null);
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
          setFundingStatus(null);
          setFundingPayable(null);
          setFundedAt(null);
          setOwnerCashBalanceMinor(null);
          setFundingLoadError({
            code: (fJson as { error?: string }).error || "load_failed",
            status: fRes.status,
          });
        }
      } catch {
        setFundingStatus(null);
        setFundingPayable(null);
        setFundedAt(null);
        setOwnerCashBalanceMinor(null);
        setFundingLoadError({ code: "network_error" });
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
    setPerfError(null);
    const qs = new URLSearchParams({
      range: perfRange,
      productKind: campaign.productKind,
    });
    void fetch(
      `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/performance?${qs.toString()}`,
      { credentials: "include", cache: "no-store" }
    )
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          performance?: DeliveryAdPerformancePayload;
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.performance) setPerformance(json.performance);
        else if (res.ok && json.ok) setPerformance(null);
        else {
          setPerformance(null);
          setPerfError({ code: json.error || "load_failed", status: res.status });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPerformance(null);
          setPerfError({ code: "network_error" });
        }
      })
      .finally(() => {
        if (!cancelled) setPerfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign, campaignId, perfRange, perfReloadKey]);

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
    if (tone === "urgent") return "border-sam-danger/40 bg-sam-app text-sam-fg";
    if (tone === "info") return "border-sam-primary/30 bg-sam-primary/5 text-sam-fg";
    return "border-sam-border bg-sam-surface text-sam-fg";
  }

  async function runAction(action: AdminDeliveryAdAction, opts?: { reason?: string; confirmed?: boolean }) {
    if (!campaign || busy) return;

    if (REVIEW_CONFIRM_ACTIONS.has(action) && !opts?.confirmed) {
      setError(null);
      const ws = deliveryReviewToWorkspaceAction(action);
      if (!ws) return;
      const family = campaign.productKind === "store_sponsored" ? "delivery_sponsored" : "delivery_banner";
      const copy = adsWorkspaceMutationConfirmCopy(ws, lang !== "en", { family });
      const confirmed = await confirmAdminAction({
        level: adminActionLevel(deliveryReviewConfirmKind(action)),
        ko: lang !== "en",
        title: copy.title,
        description: copy.body,
        confirmLabel: copy.confirmLabel,
        destructive: copy.tone === "danger",
        reasonPlaceholder: copy.reasonLabel,
      });
      if (!confirmed.ok) return;
      await runAction(action, { reason: confirmed.reason ?? "", confirmed: true });
      return;
    }

    const opsConfirm = DELIVERY_AD_OPS_CONFIRM[action];
    if (opsConfirm && !opts?.confirmed) {
      setError(null);
      const ko = lang !== "en";
      const target = campaign.title?.trim() || campaign.id;
      const confirmed = await confirmAdminAction({
        level: adminActionLevel(opsConfirm.kind),
        ko,
        title: ko ? opsConfirm.titleKo : opsConfirm.titleEn,
        description: [target, ko ? opsConfirm.descKo : opsConfirm.descEn].join("\n"),
        confirmLabel: safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
          fallbackKo: action,
          fallbackEn: action,
        }),
        destructive: opsConfirm.destructive,
        retypeValue: target,
      });
      if (!confirmed.ok) return;
      await runAction(action, { reason: confirmed.reason ?? "", confirmed: true });
      return;
    }

    const reasonValue = (opts?.reason ?? "").trim();
    if (adminActionRequiresReason(action) && !reasonValue) {
      // 사유 필수 동작은 위 확인창에서 사유를 받는다 — 여기 도달 = 사유 없이 호출된 경우.
      setError(adminOperatorErrorMessage("reason_required", lang !== "en"));
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
            reason: reasonValue || null,
            ownerVisibleNotes: reasonValue || null,
          }),
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { refundWarning?: string; refundQueued?: boolean };
      };
      if (!res.ok || !json.ok) {
        setError(
          json.error === "funding_required"
            ? t("admin_delivery_ad_funding_required")
            : adminOperatorErrorMessage(json.error || "action_failed", lang !== "en")
        );
        return;
      }
      emitAdminQueueChanged("delivery_ad_ops");
      const refundWarning = json.result?.refundWarning ?? null;
      const refundQueued = json.result?.refundQueued === true;
      if (action === "approve" || action === "reject" || action === "request_changes") {
        setReviewSuccessKind(action);
      }
      if (action === "delete_safe_draft") {
        router.push(DELIVERY_AD_ADMIN_ROUTES.hub);
        return;
      }
      await load();
      if (refundWarning) {
        // DEF-5: 반려 후 캐시 환불 실패 — 숨기지 않고 표시, 처리 대기 등록 여부도 함께 안내.
        setError(
          `${adminOperatorErrorMessage(refundWarning, lang !== "en")} ${t(
            refundQueued ? "admin_r4c_ad_refund_queued" : "admin_r4c_ad_refund_not_queued"
          )}`
        );
      }
    } catch {
      setError(adminOperatorErrorMessage("network_error", lang !== "en"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (!campaign || busy) return;
    // v4 UI-01: 입력칸은 필리핀 시간(PHT) — 기기 시간대로 재해석하지 않는다.
    const startIso = adminManilaInputToIso(startAt, campaign.startAt);
    const endIso = adminManilaInputToIso(endAt, campaign.endAt);
    if (!startIso || !endIso) {
      setError(
        lang === "en"
          ? "Enter both start and end (Philippine time)."
          : "시작·종료 일시를 모두 입력하세요 (필리핀 시간)."
      );
      return;
    }
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
          startAt: startIso,
          endAt: endIso,
          reason: null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        if (json.error === "use_extension_flow") {
          setError(
            lang === "en"
              ? "To extend the end date, use Period extension below (PAID or compensation)."
              : "종료일 연장은 아래 「기간 연장」에서 유료/보상으로 처리하세요."
          );
        } else {
          setError(json.error || "update_failed");
        }
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function previewExtendQuote() {
    if (!campaign) return;
    setExtendBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        days: String(extendDays),
        kind: extendKind,
        previousEndAt: campaign.endAt,
      });
      const res = await fetch(
        `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/extend?${qs}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        quote?: {
          amountMinor: number;
          currency: string;
          previousEndAt: string;
          newEndAt: string;
          daysAdded: number;
        };
      };
      if (!res.ok || !json.ok || !json.quote) {
        setExtendQuote(null);
        setError(json.error || "quote_failed");
        return;
      }
      setExtendQuote(json.quote);
    } catch {
      setError("network_error");
    } finally {
      setExtendBusy(false);
    }
  }

  async function submitExtend() {
    if (!campaign || extendBusy) return;
    if (!extendReason.trim()) {
      setError(lang === "en" ? "Extension reason is required." : "연장 사유를 입력하세요.");
      return;
    }
    const quote = extendQuote;
    if (!quote || quote.daysAdded !== extendDays) {
      setExtendQuote(null);
      setError(
        lang === "en"
          ? "Preview the cost again for the current input before applying."
          : "현재 입력으로 비용 미리보기를 다시 한 뒤 실행하세요."
      );
      return;
    }
    const ko = lang !== "en";
    const amountLabel =
      extendKind === "ADMIN_FREE_COMPENSATION"
        ? ko
          ? "0 (보상)"
          : "0 (compensation)"
        : `${(quote.amountMinor / 100).toFixed(2)} ${quote.currency}`;
    // 사유는 입력칸(필수)으로 받아 API 로 보내므로 확인은 1회(저장 단계)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "광고 기간을 연장할까요?" : "Extend the ad period?",
      description: ko
        ? `종료 ${formatAdminManilaDateTime(quote.previousEndAt)} → ${formatAdminManilaDateTime(quote.newEndAt)} (필리핀 시간) · ${quote.daysAdded}일 · 추가 비용 ${amountLabel}`
        : `End ${formatAdminManilaDateTime(quote.previousEndAt)} → ${formatAdminManilaDateTime(quote.newEndAt)} (PHT) · ${quote.daysAdded} days · Amount ${amountLabel}`,
      confirmLabel: ko ? "연장 실행" : "Apply extension",
    });
    if (!confirmed.ok) return;
    setExtendBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/extend`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productKind: campaign.productKind,
            expectedUpdatedAt: campaign.updatedAt,
            requestedDays: extendDays,
            extensionKind: extendKind,
            reason: extendReason.trim(),
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || json.detail || "extend_failed");
        return;
      }
      setExtendReason("");
      setExtendQuote(null);
      await load();
    } catch {
      setError("network_error");
    } finally {
      setExtendBusy(false);
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
          reason: null,
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
          reason: null,
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
          reason: null,
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
          reason: null,
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
          {/* LNK-8 — back to the visible ads workspace (legacy hub is hidden from the menu). */}
          <Link
            href="/admin/advertising"
            className="text-[12px] text-sam-primary underline-offset-2 hover:underline"
          >
            ← {lang === "en" ? "Back to ads" : "광고 목록으로"}
          </Link>
          <h1 className="mt-1 text-[20px] font-bold text-sam-fg">
            {campaign
              ? lang === "en"
                ? "Review ad application"
                : "광고 신청 검토"
              : safeT("admin_delivery_ads_detail_title", {
                  fallbackKo: "광고 상세",
                  fallbackEn: "Ad detail",
                })}
          </h1>
          {campaign ? (
            <p className="mt-1 text-[14px] text-sam-muted">
              {campaign.storeName || "—"}
              {campaign.storeId ? (
                <>
                  {" "}
                  <Link
                    href={`/admin/business/${encodeURIComponent(campaign.storeId)}`}
                    className="text-[12px] font-semibold text-sam-primary underline-offset-2 hover:underline"
                    data-admin-delivery-ads-store-detail-link="1"
                  >
                    {lang === "en" ? "Store detail" : "매장 상세"}
                  </Link>
                </>
              ) : null}
              {" · "}
              {safeT(adminDeliveryAdProductLabelKey(campaign.productKind), {
                fallbackKo: campaign.productKind,
                fallbackEn: campaign.productKind,
              })}
            </p>
          ) : null}
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
            {adminOperatorErrorMessage(error, lang !== "en")}
          </p>
        ) : null}

        {reviewSuccessKind && campaign ? (
          <section
            className="rounded-ui-rect border border-sam-primary/30 bg-sam-primary/5 p-4"
            data-admin-delivery-review-success="1"
            data-success-kind={reviewSuccessKind}
          >
            <p className="text-[14px] font-semibold text-sam-fg">
              {reviewSuccessKind === "approve"
                ? lang === "en"
                  ? "Ad approved."
                  : "광고가 승인되었습니다."
                : reviewSuccessKind === "request_changes"
                  ? lang === "en"
                    ? "Ad held."
                    : "광고가 보류되었습니다."
                  : lang === "en"
                    ? "Ad rejected."
                    : "광고가 반려되었습니다."}
            </p>
            {reviewSuccessKind === "approve" ? (
              <div className="mt-2 space-y-1 text-[13px]">
                <p className="font-semibold">{lang === "en" ? "Approved" : "승인 완료"}</p>
                <p>
                  <span className="text-sam-muted">{lang === "en" ? "Placement" : "노출 위치"}: </span>
                  {(campaign.inventoryKeys ?? [])
                    .map((k) => adminDeliveryAdInventoryHumanLabel(k, lang))
                    .join(" · ") || "—"}
                </p>
                <p>
                  <span className="text-sam-muted">{lang === "en" ? "Operating" : "운영 상태"}: </span>
                  {safeT(
                    `admin_delivery_ads_lifecycle_${campaign.lifecycleStatus.toLowerCase()}` as MessageKey,
                    {
                      fallbackKo: campaign.lifecycleStatus,
                      fallbackEn: campaign.lifecycleStatus,
                    }
                  )}
                </p>
                <Link
                  href="/admin/advertising/operations"
                  className="mt-2 inline-flex rounded-ui-rect bg-sam-primary px-3 py-1.5 text-[12px] font-semibold text-sam-on-primary"
                  data-admin-delivery-ops-link="1"
                >
                  {lang === "en" ? "View in operations" : "노출 관리에서 보기"}
                </Link>
              </div>
            ) : null}
          </section>
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
                <AdminActionLink
                  href={`${DELIVERY_AD_ADMIN_ROUTES.creative(campaignId)}?product=banner`}
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  data-admin-delivery-ads-action="produce_banner"
                >
                  {safeT("admin_delivery_ads_creative_produce_cta", {
                    fallbackKo: "배너 제작하기",
                    fallbackEn: "Produce banner",
                  })}
                </AdminActionLink>
              ) : null}
              {requiredDecision.decisionRequired &&
              requiredDecision.primaryReviewActions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" data-admin-decision-primary-ctas="1">
                  {requiredDecision.primaryReviewActions.map((action) => {
                    const approveBlocked =
                      action === "approve" &&
                      campaign.productKind === "banner" &&
                      bannerPublishReady?.ok === false;
                    return (
                    <AdminActionButton variant={action === "approve" ? "primary" : "secondary"}
                      key={`rd-${action}`}
                      disabled={busy || approveBlocked || writeBlocked}
                      title={
                        writeBlocked
                          ? writeBlockedTitle
                          : approveBlocked
                          ? lang === "en"
                            ? "Banner creative is not ready for approval"
                            : "배너 소재가 준비되지 않아 승인할 수 없습니다"
                          : undefined
                      }
                      data-admin-delivery-ads-action={action}
                      onClick={() => void runAction(action)}
                    >
                      {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                        fallbackKo: action,
                        fallbackEn: action,
                      })}
                    </AdminActionButton>
                    );
                  })}
                </div>
              ) : null}
              {campaign.productKind === "banner" &&
              bannerPublishReady?.ok === false &&
              requiredDecision.primaryReviewActions.includes("approve") ? (
                <p className="mt-2 text-[12px] text-sam-warning">
                  {lang === "en"
                    ? "Approve is disabled because banner creative is not ready."
                    : "승인이 비활성인 이유: 배너 소재가 아직 준비되지 않았습니다."}
                </p>
              ) : null}
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
                    <dt className="text-sam-muted">
                      {lang === "en" ? "Store" : "매장"}
                    </dt>
                    <dd>{campaign.storeName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">
                      {lang === "en" ? "Owner" : "사장님"}
                    </dt>
                    <dd>{campaign.ownerDisplayName || "—"}</dd>
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
                    <dt className="text-sam-muted">
                      {lang === "en" ? "Status" : "상태"}
                    </dt>
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
                    <dt className="text-sam-muted">
                      {lang === "en" ? "Period" : "기간"}
                    </dt>
                    <dd className="text-sam-fg">
                      {formatAdminManilaDateTime(campaign.startAt)}
                      {" ~ "}
                      {formatAdminManilaDateTime(campaign.endAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sam-muted">
                      {lang === "en" ? "Remaining" : "남은 기간"}
                    </dt>
                    <dd>
                      {adsRemainingPeriodLabel(campaign.startAt, campaign.endAt, lang !== "en") ||
                        "—"}
                    </dd>
                  </div>
                </dl>
                <details className="mt-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-2 py-1.5">
                  <summary className="cursor-pointer text-[12px] text-sam-muted">
                    {lang === "en" ? "Technical info" : "기술 정보"}
                  </summary>
                  <p className="mt-1 break-all font-mono text-[12px] text-sam-muted">
                    ID {campaign.id}
                  </p>
                </details>
              </AdminCard>
              </div>

            {/* C — 결제 (collapsed by default) */}
            <div data-admin-delivery-ads-detail-section="funding">
              <AdminActionButton variant="secondary" className="w-full !justify-between" aria-expanded={fundingExpanded}
                onClick={() => setFundingExpanded((v) => !v)}
              >
                {safeT("admin_delivery_ads_section_funding_title", {
                  fallbackKo: "결제",
                  fallbackEn: "Funding",
                })}
                <span>{fundingExpanded ? "−" : "+"}</span>
              </AdminActionButton>
              {fundingExpanded ? (
              <AdminCard titleKey="admin_delivery_ads_section_funding_title">
                <div data-admin-delivery-ads-funding="1" className="space-y-2 text-[13px] text-sam-fg">
                  {fundingLoadError ? (
                    <div data-admin-delivery-ads-funding-error="1">
                      <AdminErrorState
                        ko={lang !== "en"}
                        code={fundingLoadError.code}
                        httpStatus={fundingLoadError.status}
                        onRetry={() => void load()}
                      />
                    </div>
                  ) : null}
                  <p hidden={Boolean(fundingLoadError)}>
                    {t("admin_delivery_ads_funding_status")}:{" "}
                    {t(adminDeliveryAdFundingStatusLabelKey(fundingStatus))}
                    {" · "}
                    {t("admin_delivery_ads_funding_payable")}:{" "}
                    {formatAdminDeliveryAdPriceOrUnset(fundingPayable, lang)}
                    {fundedAt ? ` · ${formatAdminManilaDateTime(fundedAt)} PHT` : ""}
                  </p>
                  <p data-admin-business-cash-balance="1">
                    {safeT("admin_delivery_ads_owner_cash_balance", {
                      fallbackKo: "매장의 Cash 잔액",
                      fallbackEn: "Store's Cash balance",
                    })}
                    :{" "}
                    {ownerCashBalanceMinor == null
                      ? "—"
                      : formatAdminDeliveryAdPriceOrUnset(ownerCashBalanceMinor, lang)}
                  </p>
                  {fundingStatus !== "FUNDED" && !fundingLoadError ? (
                    <p className="text-[12px] text-sam-warning">
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
                    <p className="mt-1 text-[12px] text-sam-muted">
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
                            fallbackKo: "매장의 Cash/Coin 보기",
                            fallbackEn: "Open the store's Cash/Coin",
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
                      fallbackKo: "노출 예시",
                      fallbackEn: "Exposure example",
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
                  <AdminActionLink
                    href={`${DELIVERY_AD_ADMIN_ROUTES.creative(campaignId)}?product=banner`}
                    variant="secondary"
                    className="mt-3"
                    data-admin-delivery-ads-creative-studio-link="1"
                  >
                    {safeT("admin_delivery_ads_creative_produce_cta", {
                      fallbackKo: "배너 제작 스튜디오 열기",
                      fallbackEn: "Open banner studio",
                    })}
                  </AdminActionLink>
                </AdminCard>
              </div>
            ) : null}

            {/* F — decision actions (collapsed by default) */}
            <div data-admin-delivery-ads-detail-section="decision-actions">
              <AdminActionButton variant="secondary" className="w-full !justify-between" aria-expanded={decisionActionsExpanded}
                onClick={() => setDecisionActionsExpanded((v) => !v)}
              >
                {safeT("admin_delivery_ads_section_decision_actions", {
                  fallbackKo: "추가 검수 액션",
                  fallbackEn: "Additional review actions",
                })}
                <span>{decisionActionsExpanded ? "−" : "+"}</span>
              </AdminActionButton>
              {decisionActionsExpanded ? (
              <AdminCard titleKey="admin_delivery_ads_section_decision_actions">
                <div className="flex flex-wrap gap-2">
                  {(requiredDecision.decisionRequired
                    ? requiredDecision.primaryReviewActions
                    : allowedActions
                  ).map((action) => (
                    <AdminActionButton variant={action === "terminate" || action === "delete_safe_draft" ? "danger" : "secondary"} size="sm"
                      key={action}
                      title={writeBlockedTitle}
                      disabled={
                        busy ||
                        writeBlocked ||
                        (action === "approve" &&
                          campaign.productKind === "banner" &&
                          bannerPublishReady?.ok === false)
                      }
                      data-admin-delivery-ads-action={action}
                      onClick={() => void runAction(action)}
                    >
                      {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                        fallbackKo: action,
                        fallbackEn: action,
                      })}
                    </AdminActionButton>
                  ))}
                </div>
                {requiredDecision.decisionRequired && secondaryActions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-sam-border pt-3">
                    {secondaryActions.map((action) => (
                      <AdminActionButton variant="secondary" size="sm"
                        key={action}
                        disabled={busy || writeBlocked}
                        title={writeBlockedTitle}
                        data-admin-delivery-ads-action={action}
                        onClick={() => void runAction(action)}
                      >
                        {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                          fallbackKo: action,
                          fallbackEn: action,
                        })}
                      </AdminActionButton>
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
              <p className="mt-1 text-[12px] text-sam-muted">
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
              <AdminActionButton variant="secondary" className="w-full !justify-between" aria-expanded={opsExpanded}
                onClick={() => setOpsExpanded((v) => !v)}
              >
                {safeT("admin_delivery_ads_section_operations", {
                  fallbackKo: "운영 대화 (Ops)",
                  fallbackEn: "Ops conversation",
                })}
                <span>{opsExpanded ? "−" : "+"}</span>
              </AdminActionButton>
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
                    <AdminActionButton variant="secondary" size="sm"
                      disabled={busy || writeBlocked}
                      title={writeBlockedTitle}
                      onClick={() => void saveInventory()}
                    >
                      {safeT("admin_delivery_ads_save_inventory", {
                        fallbackKo: "지면 저장",
                        fallbackEn: "Save placement",
                      })}
                    </AdminActionButton>
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
                    {lang === "en" ? "Start (PHT)" : "시작 (필리핀 시간)"}
                    <input
                      type="datetime-local"
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[12px]">
                    {lang === "en" ? "End (PHT)" : "종료 (필리핀 시간)"}
                    <input
                      type="datetime-local"
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                    />
                  </label>
                </div>
                <AdminActionButton variant="secondary" size="sm" className="mt-2"
                  disabled={busy || writeBlocked}
                  title={writeBlockedTitle}
                  onClick={() => void saveSchedule()}
                >
                  {safeT("admin_delivery_ads_save_schedule", {
                    fallbackKo: "일정 저장",
                    fallbackEn: "Save schedule",
                  })}
                </AdminActionButton>
                <p className="mt-2 text-[12px] text-sam-muted">
                  {safeT("admin_delivery_ads_schedule_no_silent_extend", {
                    fallbackKo:
                      "종료일을 늘리려면 「일정 저장」이 아니라 아래 기간 연장(유료/보상)을 사용하세요. 숨김 CTA는 없습니다 — 일시중지·강제중단·종료만 지원합니다.",
                    fallbackEn:
                      "To lengthen end date, use Period extension (PAID/compensation) below — not Save schedule. No hide CTA — pause, terminate, and end only.",
                  })}
                </p>

                <div
                  className="mt-4 space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3"
                  data-admin-delivery-ads-extension="1"
                >
                  <p className="text-[13px] font-semibold text-sam-fg">
                    {safeT("admin_delivery_ads_extension_title", {
                      fallbackKo: "기간 연장",
                      fallbackEn: "Period extension",
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="extendKind"
                        checked={extendKind === "PAID"}
                        onChange={() => {
                          setExtendKind("PAID");
                          setExtendQuote(null);
                        }}
                      />
                      {lang === "en" ? "Paid" : "유료 연장"}
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="extendKind"
                        checked={extendKind === "ADMIN_FREE_COMPENSATION"}
                        onChange={() => {
                          setExtendKind("ADMIN_FREE_COMPENSATION");
                          setExtendQuote(null);
                        }}
                      />
                      {lang === "en" ? "Ops compensation" : "운영 보상 연장"}
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-[12px]">
                    {lang === "en" ? "Days to add" : "추가 일수"}
                    <input
                      type="number"
                      min={1}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5"
                      value={extendDays}
                      onChange={(e) => {
                        setExtendDays(Number(e.target.value) || 1);
                        // v4 UI-08: 입력이 바뀌면 이전 견적은 무효 — 다시 미리보기 후 실행
                        setExtendQuote(null);
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px]">
                    {lang === "en" ? "Reason (required)" : "사유 (필수)"}
                    <input
                      type="text"
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5"
                      value={extendReason}
                      onChange={(e) => setExtendReason(e.target.value)}
                    />
                  </label>
                  {extendQuote ? (
                    <ul className="space-y-1 text-[12px] text-sam-fg" data-admin-delivery-ads-extension-quote="1">
                      <li>
                        {lang === "en" ? "Current end" : "현재 종료"}:{" "}
                        {formatAdminManilaDateTime(extendQuote.previousEndAt)}
                      </li>
                      <li>
                        {lang === "en" ? "New end" : "변경 후 종료"}:{" "}
                        {formatAdminManilaDateTime(extendQuote.newEndAt)}
                      </li>
                      <li>
                        {lang === "en" ? "Days" : "일수"}: {extendQuote.daysAdded}
                      </li>
                      <li>
                        {lang === "en" ? "Amount" : "추가 비용"}:{" "}
                        {extendKind === "ADMIN_FREE_COMPENSATION"
                          ? lang === "en"
                            ? "0 (compensation)"
                            : "0 (보상)"
                          : `${(extendQuote.amountMinor / 100).toFixed(2)} ${extendQuote.currency}`}
                      </li>
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <AdminActionButton variant="secondary" size="sm"
                      disabled={extendBusy}
                      onClick={() => void previewExtendQuote()}
                    >
                      {lang === "en" ? "Preview cost" : "비용 미리보기"}
                    </AdminActionButton>
                    <AdminActionButton variant="secondary" size="sm"
                      disabled={extendBusy || !extendQuote || writeBlocked}
                      title={writeBlockedTitle}
                      onClick={() => void submitExtend()}
                    >
                      {lang === "en" ? "Apply extension" : "연장 실행"}
                    </AdminActionButton>
                  </div>
                </div>
              </AdminCard>
            </div>

            {/* I — performance ONLY ACTIVE/ENDED */}
            {isAdminDeliveryAdPerformanceLifecycle(campaign.lifecycleStatus) ? (
              <div data-admin-delivery-ads-detail-section="performance">
                <AdminActionButton variant="secondary" className="w-full !justify-between" aria-expanded={perfExpanded}
                  onClick={() => setPerfExpanded((v) => !v)}
                >
                  {safeT("admin_delivery_ads_section_performance", {
                    fallbackKo: "성과",
                    fallbackEn: "Performance",
                  })}
                  <span>{perfExpanded ? "−" : "+"}</span>
                </AdminActionButton>
                {perfExpanded ? (
                <AdminCard titleKey="admin_delivery_ads_section_performance">
                  {perfError && !perfLoading ? (
                    <AdminErrorState
                      ko={lang !== "en"}
                      code={perfError.code}
                      httpStatus={perfError.status}
                      onRetry={() => setPerfReloadKey((k) => k + 1)}
                    />
                  ) : (
                    <DeliveryAdPerformancePanel
                      performance={performance}
                      loading={perfLoading}
                      range={perfRange}
                      onRangeChange={setPerfRange}
                    />
                  )}
                </AdminCard>
                ) : null}
              </div>
            ) : null}

            {/* J — audit collapsed */}
            <div data-admin-delivery-ads-detail-section="history">
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <AdminActionButton variant="quiet" size="sm"
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
                </AdminActionButton>
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
