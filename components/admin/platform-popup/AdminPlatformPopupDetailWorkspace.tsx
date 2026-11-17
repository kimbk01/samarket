"use client";

/**
 * 팝업 만들기·수정 — 앱 진입 어드민 v3 §4 (Owner 2026-11-17 「v3대로 진행」).
 * ① 형태 8종(카드마다 그림 규격) → ② 그 형태의 그림 칸(공통 `AdminImageSlot` · 카드형은 36:25 자르기 틀) →
 * ③ 글(글자 수 표시) → ④ 누르면 이동(찾아서 고르기 · 저장 전 공개 확인) → ⑤ 진입 순서 · 자동 닫힘 · 빈도.
 * 오른쪽 = 앱과 같은 렌더러 미리보기(목록·쿠폰·말풍선은 「예시」 데이터 · 저장·앱 전송 없음).
 */

import { isoToZonedLocalInput, zonedLocalInputToIso } from "@/lib/platform-popup/zoned-local-time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  POPUP_BODY_MAX,
  POPUP_CTA_LABEL_MAX,
  POPUP_TITLE_MAX,
  popupCreativeSpecForComposition,
} from "@/lib/platform-popup/creative-size-spec";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import {
  AdminPlatformPopupAuditHistory,
  type AdminPlatformPopupAuditRow,
} from "@/components/admin/platform-popup/AdminPlatformPopupAuditHistory";
import { AdminPopupCropFrame } from "@/components/admin/platform-popup/AdminPopupCropFrame";
import { AdminPopupDestinationPicker } from "@/components/admin/platform-popup/AdminPopupDestinationPicker";
import { AdminImageSlot, readAdminImageMeta } from "@/components/admin/media/AdminImageSlot";
import { POPUP_CARD_SLOT, popupArtworkSlot } from "@/lib/admin/media/image-slot-spec";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import type { PlatformPopupAdminDetail } from "@/lib/platform-popup/admin-campaign-loader";
import {
  PLATFORM_POPUP_DEFAULT_TIMEZONE,
  type PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";
import {
  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS,
  adminSurfaceModeLabel,
  adminSurfacesFromDb,
  isAdminSurfaceSelected,
  previewSurfaceFromAdminSelection,
  surfacesFromAdminSelection,
  toggleAdminSurfaceSelection,
  type PlatformPopupAdminSurfaceMode,
} from "@/lib/platform-popup/admin-surface-target-mode";
import type { PlatformPopupTargetSurface } from "@/lib/platform-popup/types";
import {
  decodePlatformPopupOwnerCtaDestination,
  encodePlatformPopupOwnerCtaDestination,
} from "@/lib/platform-popup/popup-cta-destination-ux";
import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import { isPlatformPopupCreativeRatioOk, type PlatformPopupCropRect } from "@/lib/platform-popup/creative-pipeline-geometry";
import {
  PLATFORM_POPUP_COMPOSITIONS,
  creativeModeForComposition,
  interruptivePresentationForComposition,
  resolvePlatformPopupComposition,
  type PlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import {
  ADMIN_POPUP_COMPOSITION_PICK_ORDER,
  popupArtworkRecommendedSize,
  popupCompositionIsCard,
  popupCompositionShortLabelKey,
  popupCompositionSpecLine,
} from "@/lib/platform-popup/admin-composition-ui";
import {
  platformPopupAppliedReasonKey,
  platformPopupAppliedStateKey,
  platformPopupAppliedTone,
} from "@/lib/platform-popup/admin-applied-status-contract";
import {
  promotionOperatorStatusLabel,
  formatPromotionAdminSchedule,
  resolvePopupOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import {
  eventEditHref,
  popupApprovalStatusLabel,
  popupCompositionOperatorLabel,
  popupDestinationSummary,
  popupFrequencyOperatorDescription,
  popupFrequencyOperatorLabel,
  resolvePopupBenefitOperationalHint,
  popupBenefitHintLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import {
  buildPlatformPopupAdminPatch,
  platformPopupPatchWouldRevertToReview,
  type PlatformPopupAdminForm,
} from "@/lib/platform-popup/popup-admin-patch";
import {
  PLATFORM_POPUP_FREQUENCY_MODES,
  isPlatformPopupInterruptivePresentation,
  type PlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";
import { translateBy } from "@/lib/i18n/translate-by";

/** v3 §4 — 자동 닫힘 선택지(서버 허용 3~60초 안). 저장된 값이 이 밖이면 그 값도 칩으로 보인다. */
const ADMIN_POPUP_AUTO_DISMISS_CHOICES = [5, 10, 15] as const;

const INPUT = "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-sm text-sam-fg";

/** 광고 감사 G-10: 시작·종료 입력은 캠페인 시간대 벽시계(어드민 PC 시간대 아님) */
function toLocalInput(iso: string | null, timezone: string): string {
  return isoToZonedLocalInput(iso, timezone);
}

function fromLocalInput(v: string, timezone: string): string | null {
  if (!v.trim()) return null;
  return zonedLocalInputToIso(v, timezone);
}

function charCount(v: string): number {
  return [...v].length;
}

type AuditRow = AdminPlatformPopupAuditRow;

/** 자르기 틀에 연 그림(새로 고른 파일 · 또는 형태를 카드형으로 바꿔 다시 자르는 기존 그림) */
type CropSource = { file: File; url: string; width: number; height: number; fileName: string };

export function AdminPlatformPopupDetailWorkspace({ campaignId }: { campaignId: string }) {
  const { safeT, language, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaign, setCampaign] = useState<PlatformPopupAdminDetail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 첫 불러오기 실패 — 캠페인이 없을 때만 표준 오류 상태 + [새로고침] (이후 재조회 실패는 기존 오류 줄) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  /** P-1: 저장으로 다시 검토 상태가 됐으면 알림을 경고 모양으로 보인다 */
  const [saveNoticeWarn, setSaveNoticeWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  /** G-18: 팝업 캠페인 쓰기(저장·소재·승인·상태·삭제) = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/platform-popup");
  const writeBlocked = busy || !adminAction.allowed;
  const [dirty, setDirty] = useState(false);
  /** v3 §4: 새 팝업은 형태부터 고른다 — 고르기 전에는 다른 칸을 숨긴다 */
  const [compositionChosen, setCompositionChosen] = useState(() => searchParams.get("new") !== "1");
  /** 자르기 틀(카드형 36:25) */
  const [crop, setCrop] = useState<CropSource | null>(null);
  /** 형태를 카드형으로 바꿔 기존 그림을 다시 잘라야 저장 가능 */
  const [cropRequired, setCropRequired] = useState(false);
  /** 형태를 바꾸며 기존 그림을 쓰지 않기로 함 — 새 그림을 올려야 저장 가능 */
  const [replaceRequired, setReplaceRequired] = useState(false);
  /** v3 ④: 저장된 전체 설정 「가로 화면에서도」 (미리보기) */
  const [allowLandscape, setAllowLandscape] = useState<boolean | undefined>(undefined);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [timezone, setTimezone] = useState<string>(PLATFORM_POPUP_DEFAULT_TIMEZONE);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [selectedSurfaces, setSelectedSurfaces] = useState<PlatformPopupTargetSurface[]>(["GLOBAL"]);
  const [suppressionMode, setSuppressionMode] = useState("SESSION");
  const [durationSec, setDurationSec] = useState<number | "">("");
  const [presentationType, setPresentationType] = useState<PlatformPopupInterruptivePresentation>("center_modal");
  const [frequencyMode, setFrequencyMode] = useState("once_per_session");
  const [creativeMode, setCreativeMode] = useState<"card" | "artwork">("card");
  const [ctaType, setCtaType] = useState("internal_page");
  // DS-5: 이동 경로 기본값 없음 — 빈칸이면 저장 때 막는다
  const [ctaTarget, setCtaTarget] = useState<string>("");
  const [externalUrl, setExternalUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [promoTitle, setPromoTitle] = useState("");
  const [promoBody, setPromoBody] = useState("");
  const [altText, setAltText] = useState("");
  // 진입 감사 PO-2·PO-3 (2026-11-17)
  const [queueClass, setQueueClass] = useState<"mandatory" | "optional">("optional");
  const [autoDismiss, setAutoDismiss] = useState<number | "">("");
  const [ctaBgColor, setCtaBgColor] = useState("");
  const [ctaTextColor, setCtaTextColor] = useState("");
  const [listStoreIdsText, setListStoreIdsText] = useState("");
  const [tooltipAnchor, setTooltipAnchor] = useState<"region" | "notifications">("region");
  const [previewOverrideUrl, setPreviewOverrideUrl] = useState<string | null>(null);
  /** P-1: 처음 불러온 값 — 저장 때 이것과 비교해 바뀐 묶음만 보낸다(PTR 상세와 같은 방식) */
  const savedFormRef = useRef<PlatformPopupAdminForm | null>(null);
  /** Linked Event benefit section — Benefit Dialog eligibility (CUT 1). */
  const [eventBenefit, setEventBenefit] = useState<{ title: string; body: string | null } | null>(null);
  const [eventBenefitLoading, setEventBenefitLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("focus") !== "preview") return;
    const node = document.querySelector('[data-admin-popup-preview-sticky="1"]');
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams, campaignId, campaign?.id]);

  // v3 ④: 미리보기 가로 화면 = 저장된 전체 설정 (읽기 실패면 미리보기 기본값)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/platform-popup-campaigns/entry-policy", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; policy?: { allowLandscape?: boolean } };
        if (!cancelled && res.ok && json.ok && typeof json.policy?.allowLandscape === "boolean") {
          setAllowLandscape(json.policy.allowLandscape);
        }
      } catch {
        /* 미리보기 기본값 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearCrop = useCallback(() => {
    setCrop((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const hydrate = useCallback((c: PlatformPopupAdminDetail) => {
    setCampaign(c);
    setName(c.name);
    setPriority(c.priority);
    setTimezone(c.timezone || PLATFORM_POPUP_DEFAULT_TIMEZONE);
    setStartLocal(toLocalInput(c.startAt, c.timezone || PLATFORM_POPUP_DEFAULT_TIMEZONE));
    setEndLocal(toLocalInput(c.endAt, c.timezone || PLATFORM_POPUP_DEFAULT_TIMEZONE));
    setSelectedSurfaces(adminSurfacesFromDb(c.surfaces));
    setSuppressionMode(c.suppressionMode);
    setDurationSec(c.suppressionDurationSeconds ?? "");
    setPresentationType(
      isPlatformPopupInterruptivePresentation(String(c.presentationType ?? ""))
        ? (c.presentationType as PlatformPopupInterruptivePresentation)
        : "center_modal"
    );
    setFrequencyMode(c.frequencyMode || "once_per_session");
    setCreativeMode(c.creative?.creativeMode === "artwork" ? "artwork" : "card");
    setCtaType(c.ctaType);
    // DS-5: 빈 경로를 /market 으로 채우지 않는다 — 운영자가 직접 넣는다
    setCtaTarget(String(c.ctaTarget ?? "").trim());
    setExternalUrl(c.externalUrl || "");
    setCtaLabel(c.ctaLabel || "");
    setPromoTitle(c.title || "");
    setPromoBody(c.body || "");
    setAltText(c.creative?.altText || "");
    setQueueClass(c.queueClass === "mandatory" ? "mandatory" : "optional");
    setAutoDismiss(c.autoDismissSeconds ?? "");
    setCtaBgColor(c.ctaBgColor || "");
    setCtaTextColor(c.ctaTextColor || "");
    setListStoreIdsText((c.listStoreIds ?? []).join("\n"));
    setTooltipAnchor(c.tooltipAnchor === "notifications" ? "notifications" : "region");
    {
      const tz = c.timezone || PLATFORM_POPUP_DEFAULT_TIMEZONE;
      savedFormRef.current = {
        name: c.name,
        priority: c.priority,
        timezone: tz,
        startAt: fromLocalInput(toLocalInput(c.startAt, tz), tz),
        endAt: fromLocalInput(toLocalInput(c.endAt, tz), tz),
        surfaces: surfacesFromAdminSelection(adminSurfacesFromDb(c.surfaces)),
        suppressionMode: c.suppressionMode,
        suppressionDurationSeconds: c.suppressionDurationSeconds ?? null,
        // 진입 감사 4단계: 새 형태 4종도 그대로 기준값에 둔다(예전엔 center_modal 로 바뀌어 저장 때 형태가 늘 바뀐 것으로 잡힘)
        presentationType: isPlatformPopupInterruptivePresentation(String(c.presentationType ?? ""))
          ? String(c.presentationType)
          : "center_modal",
        frequencyMode: c.frequencyMode || "once_per_session",
        creativeMode: c.creative?.creativeMode === "artwork" ? "artwork" : "card",
        ctaType: c.ctaType,
        ctaTarget: String(c.ctaTarget ?? "").trim(),
        externalUrl: c.externalUrl || null,
        ctaLabel: c.ctaLabel || null,
        title: c.title || null,
        body: c.body || null,
        altText: c.creative?.altText || null,
        queueClass: c.queueClass === "mandatory" ? "mandatory" : "optional",
        autoDismissSeconds: c.autoDismissSeconds ?? null,
        ctaBgColor: c.ctaBgColor || null,
        ctaTextColor: c.ctaTextColor || null,
        listStoreIds: c.listStoreIds ?? [],
        tooltipAnchor: c.tooltipAnchor === "notifications" ? "notifications" : "region",
      };
    }
    setPreviewOverrideUrl(null);
    setDirty(false);
    setCropRequired(false);
    setReplaceRequired(false);
    setCrop((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const fetchDetail = useCallback(async (): Promise<
    { ok: true; campaign: PlatformPopupAdminDetail } | { ok: false; failure: AdminLoadFailure; error: string }
  > => {
    let res: Response;
    try {
      res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, { credentials: "same-origin" });
    } catch {
      return { ok: false, failure: { code: "network_error" }, error: "network_error" };
    }
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: PlatformPopupAdminDetail;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.campaign) {
      return {
        ok: false,
        failure: { code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status },
        error: json.error || "load_failed",
      };
    }
    return { ok: true, campaign: json.campaign };
  }, [campaignId]);

  const load = useCallback(async () => {
    setError(null);
    setLoadErr(null);
    const [detail, auditRes] = await Promise.all([
      fetchDetail(),
      fetch(`/api/admin/platform-popup-campaigns/${campaignId}/audit`, { credentials: "same-origin" }).catch(() => null),
    ]);
    if (!detail.ok) {
      setLoadErr(detail.failure);
      setError(formatPlatformPopupAdminError(detail.error, language === "en" ? "en" : "ko"));
      return;
    }
    hydrate(detail.campaign);
    const auditJson = auditRes
      ? ((await auditRes.json().catch(() => ({}))) as { ok?: boolean; items?: AuditRow[] })
      : {};
    if (auditJson.ok) setAudit(auditJson.items ?? []);
  }, [campaignId, fetchDetail, hydrate, language]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 그림만 새로 올린 뒤 — 캠페인(그림·상태·앱에 나오나)만 다시 읽고 입력 중인 다른 칸은 그대로 둔다.
   * 저장 기준값의 그림 형태·대체 글도 서버 값으로 맞춘다(같은 값을 다시 보내지 않게).
   */
  const reloadCreativeOnly = useCallback(async () => {
    const detail = await fetchDetail();
    if (!detail.ok) return;
    const c = detail.campaign;
    setCampaign(c);
    if (savedFormRef.current) {
      savedFormRef.current = {
        ...savedFormRef.current,
        creativeMode: c.creative?.creativeMode === "artwork" ? "artwork" : "card",
        altText: c.creative?.altText || null,
      };
    }
  }, [fetchDetail]);

  const ctaHrefPreview = useMemo(() => {
    const r = validatePlatformPopupCta({
      ctaType,
      ctaTarget,
      externalUrl: externalUrl || null,
    });
    return r.ok ? r.value.href : "";
  }, [ctaType, ctaTarget, externalUrl]);

  useEffect(() => {
    let cancelled = false;
    const eventId = ctaType === "event_detail" ? String(ctaTarget ?? "").trim() : "";
    if (!eventId) {
      setEventBenefit(null);
      setEventBenefitLoading(false);
      return;
    }
    setEventBenefitLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-events/${eventId}`, { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          event?: { sections?: unknown };
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.event) {
          setEventBenefit(null);
          return;
        }
        const { extractPlatformEventBenefitContent } = await import(
          "@/lib/platform-popup/event-benefit-authority"
        );
        setEventBenefit(extractPlatformEventBenefitContent(json.event.sections ?? null));
      } catch {
        if (!cancelled) setEventBenefit(null);
      } finally {
        if (!cancelled) setEventBenefitLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctaType, ctaTarget]);

  const benefitEligible = Boolean(eventBenefit?.title?.trim());

  const previewSource = useMemo(() => {
    const imageUrl = previewOverrideUrl || (replaceRequired ? "" : campaign?.creative?.imageUrl) || "";
    if (!imageUrl || !campaign) return null;
    return {
      campaignId: campaign.id,
      creativeId: campaign.creative?.id || "preview",
      imageUrl,
      altText: altText || campaign.creative?.altText || "Advertisement",
      ctaHref: ctaHrefPreview || "/market",
      ctaType,
      ctaLabel: ctaLabel || null,
      title: promoTitle || null,
      body: promoBody || null,
      benefit: eventBenefit,
      benefitEligible,
      surface: previewSurfaceFromAdminSelection(selectedSurfaces),
      suppressionMode,
      suppressionDurationSeconds:
        durationSec === "" ? null : Number(durationSec) > 0 ? Number(durationSec) : null,
      timezone,
      presentationType,
      frequencyMode,
      creativeMode,
      aspectW: previewOverrideUrl && creativeMode === "card" ? 36 : campaign.creative?.aspectW ?? 36,
      aspectH: previewOverrideUrl && creativeMode === "card" ? 25 : campaign.creative?.aspectH ?? 25,
      unsaved: dirty || Boolean(previewOverrideUrl),
      ctaBgColor: /^#[0-9A-Fa-f]{6}$/.test(ctaBgColor.trim()) ? ctaBgColor.trim() : null,
      ctaTextColor: /^#[0-9A-Fa-f]{6}$/.test(ctaTextColor.trim()) ? ctaTextColor.trim() : null,
      tooltipAnchor,
    };
  }, [
    campaign,
    previewOverrideUrl,
    replaceRequired,
    altText,
    ctaHrefPreview,
    ctaType,
    ctaLabel,
    promoTitle,
    promoBody,
    eventBenefit,
    benefitEligible,
    selectedSurfaces,
    suppressionMode,
    durationSec,
    timezone,
    presentationType,
    frequencyMode,
    creativeMode,
    dirty,
    ctaBgColor,
    ctaTextColor,
    tooltipAnchor,
  ]);

  const markDirty = () => {
    setDirty(true);
    setSaveNotice(null);
  };

  const lang = language === "en" ? "en" : "ko";

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaveNotice(null);
    // v3 §4: 형태를 바꾼 뒤 그림 처리가 끝나야 저장 — 카드형은 자르기, 「쓰지 않기」는 새 그림
    if (cropRequired) {
      setBusy(false);
      setError(t("admin_popup_v3_save_needs_crop"));
      return;
    }
    if (replaceRequired) {
      setBusy(false);
      setError(t("admin_popup_v3_save_needs_image"));
      return;
    }
    // DS-5: 앱 안 경로 CTA 빈칸 = 저장 거부(cta_target_required) · 기본값으로 바꾸지 않는다
    if (ctaType === "internal_page" && !String(ctaTarget).trim()) {
      setBusy(false);
      setError(formatPlatformPopupAdminError("cta_target_required", lang));
      return;
    }
    const nextTarget = ctaTarget;
    const ctaCheck = validatePlatformPopupCta({
      ctaType,
      ctaTarget: nextTarget,
      externalUrl: externalUrl || null,
    });
    if (!ctaCheck.ok) {
      setBusy(false);
      setError(formatPlatformPopupAdminError(`cta_invalid:${ctaCheck.error}`, lang));
      return;
    }
    const saved = savedFormRef.current;
    if (!saved || !campaign) {
      setBusy(false);
      return;
    }
    const nextForm: PlatformPopupAdminForm = {
      name,
      priority,
      timezone,
      startAt: fromLocalInput(startLocal, timezone),
      endAt: fromLocalInput(endLocal, timezone),
      surfaces: surfacesFromAdminSelection(selectedSurfaces),
      suppressionMode,
      suppressionDurationSeconds: durationSec === "" ? null : Number(durationSec),
      presentationType,
      frequencyMode,
      creativeMode,
      ctaType,
      ctaTarget: nextTarget,
      externalUrl: externalUrl || null,
      ctaLabel: ctaLabel.trim() || null,
      title: promoTitle.trim() || null,
      body: promoBody.trim() || null,
      altText: altText.trim() || null,
      queueClass,
      autoDismissSeconds: autoDismiss === "" ? null : Number(autoDismiss),
      ctaBgColor: ctaBgColor.trim() || null,
      ctaTextColor: ctaTextColor.trim() || null,
      listStoreIds: listStoreIdsText
        .split(/[\s,]+/)
        .map((v) => v.trim())
        .filter(Boolean),
      tooltipAnchor,
    };
    // P-1: 바뀐 묶음만 보낸다 — 이름만 고쳐도 노출 중 팝업이 다시 승인 대기로 내려가던 문제
    const patchBody = buildPlatformPopupAdminPatch(saved, nextForm);
    if (Object.keys(patchBody).length === 0) {
      setBusy(false);
      setDirty(false);
      return;
    }
    // 저장 전 확인창: 노출 중 팝업의 재검토 대상 묶음을 고쳤을 때만 경고(PTR 상세와 같은 문구)
    if (
      platformPopupPatchWouldRevertToReview(patchBody, {
        status: campaign.status,
        operatorPopup: !campaign.ownerRequestId,
      })
    ) {
      const ko = lang !== "en";
      const ok = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko,
        title: t("admin_platform_popup_save_changes"),
        description: safeT("admin_popup_review_revert_confirm"),
        confirmLabel: t("common_save"),
      });
      if (!ok.ok) {
        setBusy(false);
        return;
      }
    }
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      revertedToReview?: boolean;
    };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "save_failed", lang));
      return;
    }
    await load();
    setSaveNoticeWarn(Boolean(json.revertedToReview));
    setSaveNotice(
      json.revertedToReview
        ? safeT("admin_popup_review_revert_notice")
        : translateBy(language, "admin_saved_list_and_preview_reloaded")
    );
  };

  /**
   * 상태 전이 확인 (확인 단계 표 `adminActionLevel`): 승인 = approve(L2) · 노출 시작 = exposeStart(L2) ·
   * 정지 = pause(L2 · 사유 필수 · AD2-02 공통 화면과 같은 단계) · 종료 = forceCancel(L3 · 사유만 — 대상 재입력 없음, Owner 2026-11-07).
   * L2·L3 사유는 전이 API 본문 `reason` 으로 보내고 서버가 감사 기록에 남긴다.
   */
  const confirmTransition = async (
    body: Record<string, unknown>
  ): Promise<{ ok: false } | { ok: true; reason: string | null }> => {
    const ko = language !== "en";
    const name = campaign?.name?.trim() || campaignId;
    const next = body.nextStatus;
    if (body.action === "approve" || body.activate || body.schedule) {
      const activate = Boolean(body.activate);
      return confirmAdminAction({
        level: adminActionLevel(activate ? "exposeStart" : "approve"),
        ko,
        title: activate
          ? t("admin_platform_popup_start_popup_exposure")
          : t("admin_platform_popup_approve_popup_scheduled"),
        description: t("admin_platform_popup_quoted_name", { name }),
        confirmLabel: activate ? adminCta("exposeStart", ko) : adminCta("approve", ko),
      });
    }
    if (next === "active") {
      return confirmAdminAction({
        level: adminActionLevel("exposeStart"),
        ko,
        title: t("admin_platform_popup_start_popup_exposure"),
        description: t("admin_platform_popup_quoted_name", { name }),
        confirmLabel: adminCta("exposeStart", ko),
      });
    }
    if (next === "paused") {
      return confirmAdminAction({
        level: adminActionLevel("pause"),
        ko,
        title: t("admin_platform_popup_stop_popup_exposure"),
        description: t("admin_platform_popup_stop_showing_name_can_resume", { name: String(name) }),
        confirmLabel: adminCta("exposeStop", ko),
      });
    }
    if (next === "ended") {
      return confirmAdminAction({
        level: adminActionLevel("forceCancel"),
        ko,
        title: t("admin_platform_popup_end_popup"),
        description: t("admin_platform_popup_end_name_ended_popup_cannot", { name: String(name) }),
        confirmLabel: t("admin_platform_popup_action_end"),
        destructive: true,
      });
    }
    return { ok: true, reason: null };
  };

  const transition = async (body: Record<string, unknown>) => {
    const confirmed = await confirmTransition(body);
    if (!confirmed.ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmed.reason ? { ...body, reason: confirmed.reason } : body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(
        formatPlatformPopupAdminError(json.error || "transition_failed", language === "en" ? "en" : "ko")
      );
      return;
    }
    await load();
  };

  /** 그림 올리기 — 카드형은 자르기 틀 사각형(원본 픽셀)을 함께 보낸다. 서버가 같은 검사를 다시 한다. */
  const uploadCreative = async (file: File, mode: "card" | "artwork", cropRect?: PlatformPopupCropRect | null) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    if (cropRect) {
      fd.set("cropX", String(cropRect.x));
      fd.set("cropY", String(cropRect.y));
      fd.set("cropW", String(cropRect.width));
      fd.set("cropH", String(cropRect.height));
    }
    if (altText) fd.set("altText", altText);
    fd.set("creativeMode", mode);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/creative`, {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      url?: string;
      message?: string;
    };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(json.message || formatPlatformPopupAdminError(json.error || "upload_failed", lang));
      return false;
    }
    clearCrop();
    setCropRequired(false);
    setReplaceRequired(false);
    setPreviewOverrideUrl(null);
    await reloadCreativeOnly();
    return true;
  };

  const openCrop = async (file: File, meta?: { width: number; height: number }) => {
    const m = meta ?? (await readAdminImageMeta(file));
    const url = URL.createObjectURL(file);
    setCrop((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url, width: m.width, height: m.height, fileName: file.name };
    });
    setPreviewOverrideUrl(null);
  };

  const operatorComposition: PlatformPopupComposition = resolvePlatformPopupComposition({
    presentationType,
    creativeMode,
  });
  const isCardComposition = popupCompositionIsCard(operatorComposition);
  const imageSlotSpec = isCardComposition
    ? POPUP_CARD_SLOT
    : popupArtworkSlot(popupArtworkRecommendedSize(operatorComposition));

  /** v3 §4 — 형태 바꾸기. 카드형 ↔ 그림형으로 바뀌고 이미 그림이 있으면 그대로 쓸지 묻는다. */
  const pickComposition = async (kind: PlatformPopupComposition) => {
    if (!(PLATFORM_POPUP_COMPOSITIONS as readonly string[]).includes(kind)) return;
    const nextMode = creativeModeForComposition(kind);
    const existing = campaign?.creative ?? null;
    const familyChanges = nextMode !== creativeMode;
    setCompositionChosen(true);
    if (kind === operatorComposition) return;
    markDirty();
    setPresentationType(interruptivePresentationForComposition(kind));
    setCreativeMode(nextMode);
    if (!familyChanges || (!existing && !crop)) return;

    const keep = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: lang !== "en",
      title: t("admin_popup_v3_keep_image_title"),
      description: t(nextMode === "card" ? "admin_popup_v3_keep_image_card" : "admin_popup_v3_keep_image_artwork"),
      confirmLabel: t("admin_popup_v3_keep_image_yes"),
    });
    if (!keep.ok) {
      clearCrop();
      setCropRequired(false);
      setReplaceRequired(true);
      return;
    }
    setReplaceRequired(false);
    if (nextMode !== "card") {
      clearCrop();
      setCropRequired(false);
      return;
    }
    // 카드형(36:25)인데 비율이 안 맞으면 저장 전에 자르기 틀을 다시 연다
    if (crop) {
      setCropRequired(true);
      return;
    }
    if (existing && !(existing.aspectW === 36 && existing.aspectH === 25)) {
      setCropRequired(true);
      try {
        const blob = await (await fetch(existing.imageUrl, { mode: "cors" })).blob();
        const file = new File([blob], "current-image.webp", { type: blob.type || "image/webp" });
        const meta = await readAdminImageMeta(file);
        if (isPlatformPopupCreativeRatioOk(meta.width, meta.height)) {
          setCropRequired(false);
          return;
        }
        await openCrop(file, meta);
      } catch {
        setError(t("admin_popup_v3_keep_image_fetch_failed"));
        setCropRequired(false);
        setReplaceRequired(true);
      }
    }
  };

  const status = campaign?.status as PlatformPopupCampaignStatus | undefined;
  const isAdminDirect = Boolean(campaign && !campaign.ownerStoreId && !campaign.ownerRequestId);
  const canDeleteDraft =
    isAdminDirect &&
    (status === "draft" || status === "pending_review");
  const exposureOp = resolvePopupOperatorStatus({
    status: campaign?.status ?? "draft",
    startsAt: campaign?.startAt ?? null,
    endsAt: campaign?.endAt ?? null,
  });
  const applied = campaign?.appliedStatus ?? null;
  const appliedReasonKey = applied ? platformPopupAppliedReasonKey(applied) : null;
  const linkedEventId =
    ctaType === "event_detail" ? String(ctaTarget ?? "").trim() : "";
  const benefitHint = resolvePopupBenefitOperationalHint({
    presentationType,
    creativeMode,
    linkedEventId: linkedEventId || null,
    linkedEventHasBenefit: linkedEventId ? benefitEligible : null,
  });
  const benefitHintLabel = popupBenefitHintLabel(benefitHint, lang);
  const showBody = operatorComposition !== "benefit_dialog" && operatorComposition !== "artwork_full";
  const showTitle = operatorComposition !== "benefit_dialog";
  const autoDismissChoices: number[] = [...ADMIN_POPUP_AUTO_DISMISS_CHOICES];
  if (typeof autoDismiss === "number" && !autoDismissChoices.includes(autoDismiss)) autoDismissChoices.push(autoDismiss);

  // 첫 불러오기 — 캠페인이 없으면 표준 로딩 / 불러오기 실패 상태만 보여 준다
  if (!campaign) {
    return (
      <div className="space-y-4" data-admin-platform-popup-detail="1">
        <AdminPageHeader backHref="/admin/platform-popup" title="…" />
        {loadErr ? (
          <AdminErrorState
            ko={language !== "en"}
            code={loadErr.code}
            httpStatus={loadErr.httpStatus}
            onRetry={() => void load()}
          />
        ) : (
          <AdminLoadingState ko={language !== "en"} />
        )}
      </div>
    );
  }

  const step = (n: number, title: string, extra?: string) => (
    <h2 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-semibold">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sam-primary text-[12px] text-sam-surface">
        {n}
      </span>
      {title}
      {extra ? <span className="text-xs font-normal text-sam-muted">{extra}</span> : null}
    </h2>
  );

  const counter = (value: string, max: number) => (
    <span className={`text-xs tabular-nums ${charCount(value) > max ? "text-sam-danger" : "text-sam-muted"}`}>
      {charCount(value)}/{max}
    </span>
  );

  return (
    <div className="space-y-4" data-admin-platform-popup-detail="1">
      <AdminPageHeader
        backHref="/admin/platform-popup"
        title={campaign?.name || "…"}
        description={
          isAdminDirect
            ? safeT("admin_platform_popup_detail_desc_admin_direct")
            : safeT("admin_platform_popup_detail_desc")
        }
      />

      {error ? (
        <p className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saveNotice ? (
        <p
          className={
            saveNoticeWarn
              ? "rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft px-3 py-2 text-sm font-medium text-sam-warning"
              : "rounded-ui-rect border border-sam-primary/30 bg-sam-primary/5 px-3 py-2 text-sm font-medium text-sam-fg"
          }
          role="status"
          data-admin-popup-save-notice="1"
          data-admin-popup-save-reverted={saveNoticeWarn ? "1" : "0"}
        >
          {saveNotice}
        </p>
      ) : null}

      <div
        className="sticky top-0 z-10 rounded-ui-rect border border-sam-border bg-sam-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
        data-admin-popup-ops-summary="1"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {applied ? (
            <span className="inline-flex items-center gap-1" data-admin-popup-summary-applied={applied.state}>
              <AdminToneBadge tone={platformPopupAppliedTone(applied.state)}>
                {safeT(platformPopupAppliedStateKey(applied.state))}
              </AdminToneBadge>
              {appliedReasonKey ? (
                <span className={applied.state === "not_shown" ? "text-sam-danger" : "text-sam-muted"}>
                  {safeT(appliedReasonKey, {
                    vars: { at: applied.startsAt ? formatPromotionAdminSchedule(applied.startsAt, lang) : "" },
                  })}
                </span>
              ) : null}
            </span>
          ) : null}
          <span data-admin-popup-summary-composition="1">
            {translateBy(lang, "admin_form")}:{" "}
            {popupCompositionOperatorLabel(operatorComposition, lang)}
          </span>
          <span data-admin-popup-summary-approval="1">
            {translateBy(lang, "admin_approval")}:{" "}
            {popupApprovalStatusLabel(campaign?.approvalStatus, lang)}
          </span>
          <span data-admin-popup-summary-period="1">
            {translateBy(lang, "admin_period")}:{" "}
            {formatPromotionAdminSchedule(campaign?.startAt ?? null, lang)} –{" "}
            {formatPromotionAdminSchedule(campaign?.endAt ?? null, lang)}
          </span>
          <span data-admin-popup-summary-destination="1">
            {translateBy(lang, "admin_destination")}:{" "}
            {popupDestinationSummary({
              ctaType,
              ctaTarget,
              externalUrl,
              lang,
            })}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          <AdminCard>
            <label className="block text-sm">
              {safeT("admin_platform_popup_field_name")}
              <input
                className={INPUT}
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" data-admin-popup-status-split="1">
              <div
                className="rounded-ui-rect border border-sam-border bg-sam-app/40 px-3 py-2 text-sm"
                data-admin-popup-approval-status="1"
              >
                <div className="text-xs text-sam-muted">{safeT("admin_platform_popup_approval_line")}</div>
                <div className="font-medium">{popupApprovalStatusLabel(campaign?.approvalStatus, lang)}</div>
              </div>
              <div
                className="rounded-ui-rect border border-sam-border bg-sam-app/40 px-3 py-2 text-sm"
                data-admin-popup-exposure-status="1"
              >
                <div className="text-xs text-sam-muted">{t("admin_popup_v3_applied_line")}</div>
                <div className="font-medium">
                  {applied ? safeT(platformPopupAppliedStateKey(applied.state)) : promotionOperatorStatusLabel(exposureOp, lang)}
                </div>
              </div>
            </div>
            {campaign?.ownerStoreId || campaign?.ownerRequestId ? (
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-sam-muted">
                {campaign?.ownerStoreId ? <span>store: {campaign.ownerStoreId}</span> : null}
                {campaign?.ownerRequestId ? <span>request: {campaign.ownerRequestId}</span> : null}
              </div>
            ) : null}
          </AdminCard>

          {/* ① 형태 — 카드마다 그림 칸 규격 */}
          <AdminCard>
            {step(1, t("admin_popup_v3_step_composition"), t("admin_popup_v3_step_composition_hint"))}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-popup-presentation-picker="1">
              {ADMIN_POPUP_COMPOSITION_PICK_ORDER.map((kind) => {
                const selected = compositionChosen && operatorComposition === kind;
                const spec = popupCompositionSpecLine(kind);
                return (
                  <AdminListItemButton
                    key={kind}
                    selected={selected}
                    disabled={writeBlocked}
                    data-admin-popup-composition={kind}
                    data-benefit-dialog-eligible={
                      kind === "benefit_dialog" ? (benefitEligible ? "1" : "0") : undefined
                    }
                    className="flex flex-col items-start border border-sam-border px-3 py-2 text-left text-sm"
                    onClick={() => void pickComposition(kind)}
                  >
                    <span className="font-semibold">{t(popupCompositionShortLabelKey(kind))}</span>
                    <span className="mt-0.5 text-xs text-sam-muted" data-admin-popup-composition-spec={kind}>
                      {t(spec.key, spec.vars)}
                    </span>
                  </AdminListItemButton>
                );
              })}
            </div>
            {!compositionChosen ? (
              <p className="mt-2 text-xs text-sam-muted" data-admin-popup-pick-first="1">
                {t("admin_popup_v3_pick_composition_first")}
              </p>
            ) : null}
            {compositionChosen && (operatorComposition === "benefit_dialog" || benefitHint !== "none") ? (
              <div
                className="mt-3 rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft/80 px-3 py-2 text-sm"
                data-admin-popup-benefit-gate="1"
              >
                <p className="text-xs text-sam-muted">{safeT("admin_platform_popup_benefit_contract")}</p>
                {eventBenefitLoading ? (
                  <p className="mt-1 text-xs text-sam-muted">{safeT("admin_platform_popup_benefit_checking")}</p>
                ) : !benefitEligible ? (
                  <p className="mt-1 text-sm text-sam-danger" data-benefit-dialog-reason="1">
                    {benefitHintLabel || safeT("admin_platform_popup_benefit_requires_event_benefit")}
                  </p>
                ) : null}
                {benefitHint === "event_link_needed" ? (
                  <p className="mt-1 text-sm text-sam-danger" data-admin-popup-benefit-next="event">
                    {safeT("admin_platform_popup_benefit_need_event")}
                  </p>
                ) : null}
                {benefitHint === "benefit_info_needed" && linkedEventId ? (
                  <p className="mt-1 text-sm" data-admin-popup-benefit-next="benefit">
                    <a href={eventEditHref(linkedEventId)} className="font-medium text-sam-fg underline">
                      {safeT("admin_platform_popup_benefit_edit_event")}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
          </AdminCard>

          {compositionChosen ? (
            <>
              {/* ② 그림 — 형태의 그림 칸만 */}
              <AdminCard>
                {(() => {
                  const spec = popupCreativeSpecForComposition(operatorComposition);
                  return step(
                    2,
                    t("admin_popup_v3_step_image", { name: t(popupCompositionShortLabelKey(operatorComposition)) }),
                    t(spec.kind === "card" ? "platform_popup_spec_card" : "platform_popup_spec_artwork", {
                      recommended: spec.recommended,
                      minimum: spec.minimum,
                      output: spec.output,
                      maxMb: Math.round(imageSlotSpec.maxBytes / 1048576),
                    })
                  );
                })()}
                <div data-admin-popup-creative-spec="1" data-admin-popup-creative-mode={creativeMode !== "artwork" ? "card" : "artwork"}>
                  <AdminImageSlot
                    key={imageSlotSpec.id}
                    spec={imageSlotSpec}
                    currentUrl={replaceRequired ? null : campaign.creative?.imageUrl ?? null}
                    currentLabel={
                      campaign.creative
                        ? t("admin_popup_v3_current_image", {
                            w: isCardComposition ? DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width : campaign.creative.aspectW,
                            h: isCardComposition ? DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height : campaign.creative.aspectH,
                          })
                        : null
                    }
                    disabled={writeBlocked}
                    onAccept={async (file, meta, check) => {
                      setError(null);
                      if (isCardComposition && check.issues.some((i) => i.code === "needs_crop")) {
                        // 36:25 가 아니면 자르기 틀 — 운영자가 고른 부분을 서버가 같은 검사 후 자른다
                        await openCrop(file, meta);
                        return;
                      }
                      await uploadCreative(file, isCardComposition ? "card" : "artwork");
                    }}
                  >
                    {crop && isCardComposition ? (
                      <div className="rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft/60 p-3">
                        <AdminPopupCropFrame
                          imageUrl={crop.url}
                          sourceWidth={crop.width}
                          sourceHeight={crop.height}
                          fileName={crop.fileName}
                          disabled={writeBlocked}
                          onConfirm={(rect) => void uploadCreative(crop.file, "card", rect)}
                          onPickOther={() => {
                            clearCrop();
                          }}
                        />
                      </div>
                    ) : null}
                  </AdminImageSlot>
                </div>
                {cropRequired && !crop ? (
                  <p className="mt-2 text-xs text-sam-warning" role="status">
                    {t("admin_popup_v3_save_needs_crop")}
                  </p>
                ) : null}
                {replaceRequired ? (
                  <p className="mt-2 text-xs text-sam-warning" role="status" data-admin-popup-replace-required="1">
                    {t("admin_popup_v3_save_needs_image")}
                  </p>
                ) : null}
                <label className="mt-3 block text-sm">
                  {safeT("admin_platform_popup_alt_text")}
                  <input
                    className={INPUT}
                    value={altText}
                    onChange={(e) => {
                      markDirty();
                      setAltText(e.target.value);
                    }}
                  />
                </label>
                {operatorComposition === "artwork_full" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="block text-sm">
                      {t("admin_platform_popup_cta_bg_color")}
                      <input
                        className={`${INPUT} font-mono`}
                        value={ctaBgColor}
                        placeholder="#RRGGBB"
                        maxLength={7}
                        onChange={(e) => {
                          markDirty();
                          setCtaBgColor(e.target.value);
                        }}
                        data-admin-popup-cta-bg="1"
                      />
                    </label>
                    <label className="block text-sm">
                      {t("admin_platform_popup_cta_text_color")}
                      <input
                        className={`${INPUT} font-mono`}
                        value={ctaTextColor}
                        placeholder="#RRGGBB"
                        maxLength={7}
                        onChange={(e) => {
                          markDirty();
                          setCtaTextColor(e.target.value);
                        }}
                        data-admin-popup-cta-text="1"
                      />
                    </label>
                    <span className="text-xs text-sam-muted sm:col-span-2">{t("admin_platform_popup_cta_color_help")}</span>
                  </div>
                ) : null}
                {operatorComposition === "list_sheet" ? (
                  <label className="mt-3 block text-sm">
                    {t("admin_platform_popup_list_store_ids")}
                    <textarea
                      className={`${INPUT} font-mono text-xs`}
                      rows={4}
                      value={listStoreIdsText}
                      onChange={(e) => {
                        markDirty();
                        setListStoreIdsText(e.target.value);
                      }}
                      data-admin-popup-list-store-ids="1"
                    />
                    <span className="mt-1 block text-xs text-sam-muted">{t("admin_platform_popup_list_store_ids_help")}</span>
                  </label>
                ) : null}
                {operatorComposition === "coupon_card" ? (
                  <p className="mt-3 text-xs text-sam-muted" data-admin-popup-coupon-help="1">
                    {t("admin_platform_popup_coupon_help")}
                  </p>
                ) : null}
                {operatorComposition === "tooltip" ? (
                  <div className="mt-3 text-sm">
                    <span className="block">{t("admin_platform_popup_tooltip_anchor")}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5" data-admin-popup-tooltip-anchor="1">
                      {(["region", "notifications"] as const).map((a) => (
                        <AdminChipButton
                          key={a}
                          selected={tooltipAnchor === a}
                          onClick={() => {
                            markDirty();
                            setTooltipAnchor(a);
                          }}
                        >
                          {t(a === "region" ? "admin_platform_popup_tooltip_anchor_region" : "admin_platform_popup_tooltip_anchor_notifications")}
                        </AdminChipButton>
                      ))}
                    </div>
                  </div>
                ) : null}
              </AdminCard>

              {/* ③ 글 — 글자 수 · 앱 글꼴 */}
              <AdminCard>
                {step(3, t("admin_popup_v3_step_copy"), t("admin_popup_v3_font_note"))}
                {showTitle ? (
                  <label className="block text-sm">
                    <span className="flex items-center justify-between">
                      {safeT("admin_platform_popup_field_title")}
                      {counter(promoTitle, POPUP_TITLE_MAX)}
                    </span>
                    <input
                      className={INPUT}
                      value={promoTitle}
                      maxLength={POPUP_TITLE_MAX}
                      onChange={(e) => {
                        markDirty();
                        setPromoTitle(e.target.value);
                      }}
                      data-admin-popup-title="1"
                    />
                  </label>
                ) : null}
                {showBody ? (
                  <label className="mt-3 block text-sm">
                    <span className="flex items-center justify-between">
                      {safeT("admin_platform_popup_field_body")}
                      {counter(promoBody, POPUP_BODY_MAX)}
                    </span>
                    <textarea
                      className={`${INPUT} h-20`}
                      value={promoBody}
                      maxLength={POPUP_BODY_MAX}
                      onChange={(e) => {
                        markDirty();
                        setPromoBody(e.target.value);
                      }}
                      data-admin-popup-body="1"
                    />
                  </label>
                ) : null}
                <label className={showTitle ? "mt-3 block text-sm" : "block text-sm"}>
                  <span className="flex items-center justify-between">
                    {safeT("admin_platform_popup_field_cta_label")}
                    {counter(ctaLabel, POPUP_CTA_LABEL_MAX)}
                  </span>
                  <input
                    className={INPUT}
                    value={ctaLabel}
                    maxLength={POPUP_CTA_LABEL_MAX}
                    placeholder={translateBy(language, "admin_e_g_get_benefit")}
                    onChange={(e) => {
                      markDirty();
                      setCtaLabel(e.target.value);
                    }}
                    data-admin-popup-cta-label="1"
                  />
                </label>
                {operatorComposition === "benefit_dialog" ? (
                  <p className="mt-2 text-xs text-sam-muted">{t("admin_popup_v3_benefit_copy_note")}</p>
                ) : null}
              </AdminCard>

              {/* ④ 누르면 이동 */}
              <AdminCard>
                {step(4, t("admin_popup_v3_step_destination"))}
                {campaign?.ownerStoreId ? (
                  <fieldset className="mb-3 space-y-2" data-admin-popup-cta-product="1">
                    {(
                      [
                        ["store", "admin_popup_cta_go_store"],
                        ["menu", "admin_popup_cta_go_menu_section"],
                        ["promotion", "admin_popup_cta_go_promo_section"],
                      ] as const
                    ).map(([kind, labelKey]) => (
                      <label key={kind} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="admin-popup-cta-product"
                          checked={
                            decodePlatformPopupOwnerCtaDestination({
                              ctaType,
                              ctaTarget,
                              storeId: campaign.ownerStoreId || "",
                            }) === kind &&
                            (ctaType === "store" || ctaType === "internal_page")
                          }
                          onChange={() => {
                            const enc = encodePlatformPopupOwnerCtaDestination({
                              kind,
                              storeId: campaign.ownerStoreId || "",
                            });
                            if (!enc.ok) return;
                            markDirty();
                            setCtaType(enc.value.ctaType);
                            setCtaTarget(enc.value.ctaTarget);
                            setExternalUrl("");
                          }}
                        />
                        <span>{t(labelKey)}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <AdminPopupDestinationPicker
                  value={{ ctaType, ctaTarget, externalUrl }}
                  disabled={writeBlocked}
                  onChange={(next) => {
                    markDirty();
                    setCtaType(next.ctaType);
                    setCtaTarget(next.ctaTarget);
                    setExternalUrl(next.externalUrl);
                  }}
                />
              </AdminCard>

              {/* ⑤ 진입 순서 · 자동 닫힘 · 빈도 */}
              <AdminCard>
                {step(5, t("admin_popup_v3_step_entry"))}
                <div className="space-y-3" data-admin-popup-entry-fields="1">
                  <div>
                    <span className="block text-sm">{t("admin_platform_popup_queue_class")}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5" data-admin-popup-queue-class="1">
                      {(["mandatory", "optional"] as const).map((q) => (
                        <AdminChipButton
                          key={q}
                          selected={queueClass === q}
                          onClick={() => {
                            markDirty();
                            setQueueClass(q);
                          }}
                        >
                          {t(q === "mandatory" ? "admin_popup_v3_queue_first_required" : "admin_popup_v3_queue_normal")}
                        </AdminChipButton>
                      ))}
                    </div>
                    <span className="mt-1 block text-xs text-sam-muted">{t("admin_platform_popup_queue_help")}</span>
                  </div>
                  <div>
                    <span className="block text-sm">{t("admin_platform_popup_auto_dismiss")}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5" data-admin-popup-auto-dismiss="1">
                      <AdminChipButton
                        selected={autoDismiss === ""}
                        onClick={() => {
                          markDirty();
                          setAutoDismiss("");
                        }}
                      >
                        {t("admin_popup_v3_none")}
                      </AdminChipButton>
                      {autoDismissChoices.map((sec) => (
                        <AdminChipButton
                          key={sec}
                          selected={autoDismiss === sec}
                          onClick={() => {
                            markDirty();
                            setAutoDismiss(sec);
                          }}
                        >
                          {t("admin_popup_v3_seconds", { seconds: sec })}
                        </AdminChipButton>
                      ))}
                    </div>
                    <span className="mt-1 block text-xs text-sam-muted">{t("admin_platform_popup_auto_dismiss_help")}</span>
                  </div>
                  <div>
                    <span className="block text-sm">{safeT("admin_platform_popup_frequency_mode")}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5" data-admin-popup-frequency="1">
                      {PLATFORM_POPUP_FREQUENCY_MODES.map((m) => (
                        <AdminChipButton
                          key={m}
                          selected={frequencyMode === m}
                          onClick={() => {
                            markDirty();
                            setFrequencyMode(m);
                          }}
                        >
                          {popupFrequencyOperatorLabel(m, lang)}
                        </AdminChipButton>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-sam-muted" data-admin-popup-frequency-help="1">
                      {/* F-3: 선택한 빈도의 정본 안내문 (팝업·PTR·이벤트 배포 같은 함수) */}
                      {popupFrequencyOperatorDescription(frequencyMode, lang, "popup")}
                    </p>
                  </div>
                </div>
              </AdminCard>

              <AdminCard>
                <h2 className="mb-2 text-sm font-semibold">{safeT("admin_platform_popup_section_placement")}</h2>
                <p className="mb-3 text-xs text-sam-muted">{safeT("admin_platform_popup_placement_system_note")}</p>
                <fieldset className="space-y-2" data-admin-popup-surface-select="1">
                  {PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((opt) => {
                    const selected = isAdminSurfaceSelected(selectedSurfaces, opt.mode);
                    const isGlobal = opt.mode === "GLOBAL";
                    return (
                      <label
                        key={opt.mode}
                        className={`flex cursor-pointer items-start gap-2 rounded-ui-rect border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-sam-primary bg-sam-primary/10 text-sam-fg"
                            : "border-sam-border bg-sam-surface text-sam-fg"
                        }`}
                        data-admin-popup-surface-option={opt.mode}
                        data-selected={selected ? "1" : "0"}
                      >
                        <input
                          type={isGlobal ? "radio" : "checkbox"}
                          name={isGlobal ? "platform-popup-surface-global" : undefined}
                          className="mt-1 accent-[var(--sam-primary)]"
                          checked={selected}
                          onChange={() => {
                            markDirty();
                            setSelectedSurfaces((prev) =>
                              toggleAdminSurfaceSelection(prev, opt.mode, isGlobal ? true : !selected)
                            );
                          }}
                        />
                        <span>
                          <span className={`font-medium ${selected ? "text-sam-primary" : ""}`}>
                            {language === "en" ? opt.labelEn : opt.labelKo}
                          </span>
                          <span className="mt-0.5 block text-xs text-sam-muted">
                            {language === "en" ? opt.helpEn : opt.helpKo}
                          </span>
                          <span className="mt-0.5 block font-mono text-[12px] text-sam-muted">
                            {language === "en" ? opt.pagesEn : opt.pagesKo}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                {operatorComposition === "tooltip" &&
                !selectedSurfaces.some((s) => s === "HOME" || s === "GLOBAL") ? (
                  <p className="mt-2 text-xs text-sam-warning">{t("admin_popup_applied_reason_tooltip_home_only")}</p>
                ) : null}
              </AdminCard>

              <AdminCard>
                <h2 className="mb-2 text-sm font-semibold">{safeT("admin_platform_popup_section_schedule")}</h2>
                <p className="mb-2 text-xs text-sam-muted">{safeT("admin_platform_popup_schedule_help")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-sm">
                    {translateBy(language, "admin_start_campaign_timezone")}
                    <input
                      type="datetime-local"
                      className={INPUT}
                      value={startLocal}
                      onChange={(e) => {
                        markDirty();
                        setStartLocal(e.target.value);
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    {translateBy(language, "admin_end_campaign_timezone")}
                    <input
                      type="datetime-local"
                      className={INPUT}
                      value={endLocal}
                      onChange={(e) => {
                        markDirty();
                        setEndLocal(e.target.value);
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    {translateBy(language, "admin_timezone")}
                    <input
                      className={INPUT}
                      value={timezone}
                      onChange={(e) => {
                        markDirty();
                        setTimezone(e.target.value);
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    {translateBy(language, "admin_priority")}
                    <input
                      type="number"
                      className={INPUT}
                      value={priority}
                      onChange={(e) => {
                        markDirty();
                        setPriority(Number(e.target.value));
                      }}
                    />
                  </label>
                </div>
              </AdminCard>
            </>
          ) : null}

          {/*
           * 광고 감사 G-5: 「닫은 뒤 다시 안 보기」(suppression_mode) 입력 칸 제거 — 앱은 이 값을 쓰지 않고
           * 닫기·CTA 뒤 숨김을 「빈도」(frequency_mode) 하나로 정한다(Owner FINAL `dibay-promotion-program-ssot-lock.md`
           * FREQUENCY_SSOT). 저장된 기존 값은 그대로 두고(읽기·저장 유지) 화면에서만 뺀다.
           */}

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {isAdminDirect
                ? safeT("admin_platform_popup_section_actions_ops")
                : safeT("admin_platform_popup_section_actions")}
            </h2>
            {!adminAction.allowed && adminAction.reason ? (
              <p className="mb-2 text-[12px] text-sam-muted" data-admin-action-denied="1">
                {adminAction.reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <AdminActionButton
                variant="primary"
                size="sm"
                disabled={writeBlocked || !dirty}
                onClick={() => void save()}
                data-admin-popup-save="1"
                data-admin-popup-save-state={busy ? "saving" : dirty ? "dirty" : "idle"}
              >
                {busy
                  ? safeT("admin_platform_popup_saving")
                  : safeT("admin_platform_popup_save")}
                {dirty && !busy ? " *" : ""}
              </AdminActionButton>
              {!isAdminDirect ? (
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  disabled={writeBlocked || status !== "draft"}
                  onClick={() =>
                    void transition({
                      action: "transition",
                      nextStatus: "pending_review",
                      nextApproval: "pending_review",
                    })
                  }
                >
                  {safeT("admin_platform_popup_action_submit_review")}
                </AdminActionButton>
              ) : null}
              <AdminActionButton
                variant="secondary"
                size="sm"
                disabled={writeBlocked || status === "ended" || status === "active"}
                onClick={() => void transition({ action: "approve", schedule: true })}
                data-admin-popup-schedule="1"
              >
                {isAdminDirect
                  ? safeT("admin_platform_popup_action_schedule")
                  : safeT("admin_platform_popup_action_approve_schedule")}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="sm"
                disabled={writeBlocked || status === "ended" || status === "active"}
                onClick={() => void transition({ action: "approve", activate: true })}
                data-admin-popup-go-live="1"
              >
                {isAdminDirect
                  ? safeT("admin_platform_popup_action_go_live")
                  : safeT("admin_platform_popup_action_approve_active")}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="sm"
                disabled={writeBlocked || (status !== "active" && status !== "scheduled")}
                onClick={() => void transition({ action: "transition", nextStatus: "paused" })}
                data-admin-popup-pause="1"
              >
                {safeT("admin_platform_popup_action_pause")}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="sm"
                disabled={writeBlocked || status !== "paused"}
                onClick={() => void transition({ action: "transition", nextStatus: "active" })}
                data-admin-popup-resume="1"
              >
                {safeT("admin_platform_popup_action_resume")}
              </AdminActionButton>
              <AdminActionButton
                variant="danger"
                size="sm"
                disabled={writeBlocked || status === "ended" || status === "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "ended" })}
                data-admin-popup-end="1"
              >
                {safeT("admin_platform_popup_action_end")}
              </AdminActionButton>
              {canDeleteDraft && adminAction.allowed ? (
                /* 재입력 제거(Owner 2026-11-07): 삭제 = 사유만 · 공용 삭제 조치(R2) */
                <span className="contents" data-admin-popup-delete-draft="1">
                  <AdminAdDeleteAction
                    kind="popup_campaign"
                    id={campaignId}
                    title={campaign?.name?.trim() || campaignId}
                    size="sm"
                    onDone={() => router.push("/admin/advertising")}
                  />
                </span>
              ) : null}
            </div>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">{safeT("admin_platform_popup_reporting")}</h2>
            {campaign ? (
              <>
                <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <li>
                    {translateBy(language, "admin_rec_exp_metrics_impressions")}: {campaign.eventSummary.impression}
                  </li>
                  <li>
                    {translateBy(language, "admin_rec_exp_metrics_clicks")}: {campaign.eventSummary.click}
                  </li>
                  <li>
                    CTR:{" "}
                    {campaign.derived.ctr == null ? "—" : `${(campaign.derived.ctr * 100).toFixed(1)}%`}
                  </li>
                  <li>
                    {translateBy(language, "admin_dismiss")}: {campaign.eventSummary.dismiss}
                  </li>
                  <li>
                    {translateBy(language, "admin_suppress")}: {campaign.eventSummary.suppress}
                  </li>
                  <li>
                    {translateBy(language, "admin_landing_ok")}: {campaign.eventSummary.landing_success}
                  </li>
                  <li>
                    {translateBy(language, "admin_landing_fail")}: {campaign.eventSummary.landing_failure}
                  </li>
                  <li>
                    {translateBy(language, "admin_eligible")}: {campaign.eventSummary.eligible}
                  </li>
                </ul>
                {Object.keys(campaign.eventSummaryBySurface ?? {}).length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs" data-admin-popup-surface-breakdown="1">
                    <p className="font-semibold text-sam-fg">{translateBy(language, "admin_by_surface")}</p>
                    {Object.entries(campaign.eventSummaryBySurface).map(([surf, counts]) => {
                      const label =
                        surf === "UNKNOWN"
                          ? translateBy(language, "admin_unknown")
                          : adminSurfaceModeLabel(surf as PlatformPopupAdminSurfaceMode, lang);
                      return (
                        <p key={surf} className="text-sam-muted">
                          {label}: {translateBy(language, "admin_imp")} {counts.impression ?? 0} ·{" "}
                          {translateBy(language, "admin_clk")} {counts.click ?? 0}
                        </p>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
          </AdminCard>

          <AdminPlatformPopupAuditHistory items={audit} lang={lang} />
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start" data-admin-popup-preview-sticky="1">
          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">{safeT("admin_platform_popup_section_preview")}</h2>
            <AdminPlatformPopupPreview source={compositionChosen ? previewSource : null} allowLandscape={allowLandscape} />
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
