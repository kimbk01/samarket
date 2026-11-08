"use client";

import { isoToZonedLocalInput, zonedLocalInputToIso } from "@/lib/platform-popup/zoned-local-time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminDestinationResolvedHint } from "@/components/admin/destination/AdminDestinationResolvedHint";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import {
  AdminPlatformPopupAuditHistory,
  type AdminPlatformPopupAuditRow,
} from "@/components/admin/platform-popup/AdminPlatformPopupAuditHistory";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import type { PlatformPopupAdminDetail } from "@/lib/platform-popup/admin-campaign-loader";
import {
  PLATFORM_POPUP_CTA_TYPES,
  PLATFORM_POPUP_DEFAULT_TIMEZONE,
  type PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";
import {
  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS,
  adminSurfaceModeLabel,
  adminSurfacesFromDb,
  adminSurfacesSelectionLabel,
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
import {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS,
  POPUP_CREATIVE_SOURCE_MAX_BYTES,
} from "@/lib/platform-popup/creative-pixel-ssot";
import {
  buildPlatformPopupCenterCropPreviewUrl,
  readPlatformPopupImageMeta,
  type PlatformPopupClientImageMeta,
} from "@/lib/platform-popup/client-creative-crop-preview";
import {
  PLATFORM_POPUP_COMPOSITIONS,
  compositionContractNote,
  creativeModeForComposition,
  interruptivePresentationForComposition,
  resolvePlatformPopupComposition,
  type PlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import {
  resolvePopupOperatorStatus,
  promotionOperatorStatusLabel,
  formatPromotionAdminSchedule,
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
import { PLATFORM_POPUP_FREQUENCY_MODES } from "@/lib/platform-popup/presentation-contract";
import { translateBy } from "@/lib/i18n/translate-by";

/** 광고 감사 G-10: 시작·종료 입력은 캠페인 시간대 벽시계(어드민 PC 시간대 아님) */
function toLocalInput(iso: string | null, timezone: string): string {
  return isoToZonedLocalInput(iso, timezone);
}

function fromLocalInput(v: string, timezone: string): string | null {
  if (!v.trim()) return null;
  return zonedLocalInputToIso(v, timezone);
}

type AuditRow = AdminPlatformPopupAuditRow;

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
  // AL-15: 승인·운영 버튼은 PTR 상세와 같은 상태 조건을 함께 본다(검토 요청 = 초안 · 승인 = 종료·노출 중 아님 · 중지 = 노출·예약 중)
  const [dirty, setDirty] = useState(false);
  const [needsCrop, setNeedsCrop] = useState(false);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<PlatformPopupClientImageMeta | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [timezone, setTimezone] = useState<string>(PLATFORM_POPUP_DEFAULT_TIMEZONE);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [selectedSurfaces, setSelectedSurfaces] = useState<PlatformPopupTargetSurface[]>(["GLOBAL"]);
  const [suppressionMode, setSuppressionMode] = useState("SESSION");
  const [durationSec, setDurationSec] = useState<number | "">("");
  const [presentationType, setPresentationType] = useState<
    "center_modal" | "bottom_sheet" | "benefit_dialog"
  >("center_modal");
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
      c.presentationType === "bottom_sheet"
        ? "bottom_sheet"
        : c.presentationType === "benefit_dialog"
          ? "benefit_dialog"
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
        presentationType:
          c.presentationType === "bottom_sheet"
            ? "bottom_sheet"
            : c.presentationType === "benefit_dialog"
              ? "benefit_dialog"
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
      };
    }
    setPreviewOverrideUrl(null);
    setDirty(false);
    setNeedsCrop(false);
    setPendingCropFile(null);
    setFileMeta(null);
    setCropPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoadErr(null);
    let detailRes: Response;
    let auditRes: Response;
    try {
      [detailRes, auditRes] = await Promise.all([
        fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, { credentials: "same-origin" }),
        fetch(`/api/admin/platform-popup-campaigns/${campaignId}/audit`, { credentials: "same-origin" }),
      ]);
    } catch {
      setLoadErr({ code: "network_error" });
      return;
    }
    const detailJson = (await detailRes.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: PlatformPopupAdminDetail;
      error?: string;
    };
    if (!detailRes.ok || !detailJson.ok || !detailJson.campaign) {
      setLoadErr({ code: adminSafeErrorCode(detailJson.error, "load_failed"), httpStatus: detailRes.status });
      setError(
        formatPlatformPopupAdminError(detailJson.error || "load_failed", language === "en" ? "en" : "ko")
      );
      return;
    }
    hydrate(detailJson.campaign);
    const auditJson = (await auditRes.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: AuditRow[];
    };
    if (auditJson.ok) setAudit(auditJson.items ?? []);
  }, [campaignId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const imageUrl = previewOverrideUrl || campaign?.creative?.imageUrl || "";
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
      aspectW: campaign.creative?.aspectW ?? 36,
      aspectH: campaign.creative?.aspectH ?? 25,
      unsaved: dirty || Boolean(previewOverrideUrl),
    };
  }, [
    campaign,
    previewOverrideUrl,
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
  ]);

  const markDirty = () => {
    setDirty(true);
    setSaveNotice(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaveNotice(null);
    const lang = language === "en" ? "en" : "ko";
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

  const uploadCreative = async (file: File, applyCrop: boolean) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    if (applyCrop) fd.set("applyCrop", "center");
    if (altText) fd.set("altText", altText);
    fd.set("creativeMode", creativeMode);
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
    if (json.error === "needs_crop") {
      setNeedsCrop(true);
      setPendingCropFile(file);
      setError(json.message || t("admin_popup_use_36_25_image"));
      return;
    }
    if (!res.ok || !json.ok) {
      setError(json.message || json.error || "upload_failed");
      return;
    }
    setNeedsCrop(false);
    setPendingCropFile(null);
    setFileMeta(null);
    setPreviewOverrideUrl(null);
    setCropPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    await load();
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setNeedsCrop(false);
    setPendingCropFile(null);
    setCropPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewOverrideUrl(null);

    if (file.size > POPUP_CREATIVE_SOURCE_MAX_BYTES) {
      const maxMb = Math.round(POPUP_CREATIVE_SOURCE_MAX_BYTES / (1024 * 1024));
      setError(t("admin_popup_image_too_large", { maxMb }));
      setFileMeta(null);
      return;
    }
    const mime = (file.type || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      setError(t("admin_popup_only_jpg_png_webp"));
      setFileMeta(null);
      return;
    }

    try {
      const meta = await readPlatformPopupImageMeta(file);
      setFileMeta(meta);
      const forceCardAspect =
        creativeMode !== "artwork" &&
        (presentationType === "center_modal" || presentationType === "bottom_sheet");
      if (forceCardAspect && !meta.ratioOk) {
        const preview = await buildPlatformPopupCenterCropPreviewUrl(file);
        setCropPreviewUrl(preview.objectUrl);
        setPreviewOverrideUrl(preview.objectUrl);
        setNeedsCrop(true);
        setPendingCropFile(file);
        setError(t("admin_popup_not_36_25_check_crop"));
        return;
      }
      await uploadCreative(file, false);
    } catch {
      setError(t("admin_popup_could_not_read_image"));
      setFileMeta(null);
    }
  };

  const status = campaign?.status as PlatformPopupCampaignStatus | undefined;
  const isAdminDirect = Boolean(campaign && !campaign.ownerStoreId && !campaign.ownerRequestId);
  const canDeleteDraft =
    isAdminDirect &&
    (status === "draft" || status === "pending_review");
  const lang = language === "en" ? "en" : "ko";
  const operatorComposition: PlatformPopupComposition = resolvePlatformPopupComposition({
    presentationType,
    creativeMode,
  });
  const compositionNote = compositionContractNote(operatorComposition);
  const exposureOp = resolvePopupOperatorStatus({
    status: campaign?.status ?? "draft",
    startsAt: campaign?.startAt ?? null,
    endsAt: campaign?.endAt ?? null,
  });
  const linkedEventId =
    ctaType === "event_detail" ? String(ctaTarget ?? "").trim() : "";
  const benefitHint = resolvePopupBenefitOperationalHint({
    presentationType,
    creativeMode,
    linkedEventId: linkedEventId || null,
    linkedEventHasBenefit: linkedEventId ? benefitEligible : null,
  });
  const benefitHintLabel = popupBenefitHintLabel(benefitHint, lang);
  const requiresCardAspect =
    operatorComposition === "promotion_card_modal" ||
    operatorComposition === "bottom_promotion_sheet";

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
        <p className="rounded border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saveNotice ? (
        <p
          className={
            saveNoticeWarn
              ? "rounded border border-sam-warning/40 bg-sam-warning-soft px-3 py-2 text-sm font-medium text-sam-warning"
              : "rounded border border-sam-primary/30 bg-sam-primary/5 px-3 py-2 text-sm font-medium text-sam-fg"
          }
          role="status"
          data-admin-popup-save-notice="1"
          data-admin-popup-save-reverted={saveNoticeWarn ? "1" : "0"}
        >
          {saveNotice}
        </p>
      ) : null}

      <div
        className="sticky top-0 z-10 rounded border border-sam-border bg-sam-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
        data-admin-popup-ops-summary="1"
      >
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span data-admin-popup-summary-composition="1">
            {translateBy(lang, "admin_form")}:{" "}
            {popupCompositionOperatorLabel(operatorComposition, lang)}
          </span>
          <span data-admin-popup-summary-approval="1">
            {translateBy(lang, "admin_approval")}:{" "}
            {popupApprovalStatusLabel(campaign?.approvalStatus, lang)}
          </span>
          <span data-admin-popup-summary-exposure="1">
            {translateBy(lang, "admin_exposure")}:{" "}
            {promotionOperatorStatusLabel(exposureOp, lang)}
          </span>
          <span data-admin-popup-summary-period="1">
            {translateBy(lang, "admin_period")}:{" "}
            {formatPromotionAdminSchedule(campaign?.startAt ?? null, lang)} –{" "}
            {formatPromotionAdminSchedule(campaign?.endAt ?? null, lang)}
          </span>
          <span data-admin-popup-summary-event="1">
            {translateBy(lang, "admin_event")}:{" "}
            {linkedEventId ? linkedEventId.slice(0, 8) : translateBy(lang, "admin_text_3")}
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
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_basic")}
            </h2>
            <label className="block text-sm">
              {safeT("admin_platform_popup_field_name")}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" data-admin-popup-status-split="1">
              <div
                className="rounded border border-sam-border bg-sam-app/40 px-3 py-2 text-sm"
                data-admin-popup-approval-status="1"
              >
                <div className="text-xs text-sam-muted">
                  {safeT("admin_platform_popup_approval_line")}
                </div>
                <div className="font-medium">
                  {popupApprovalStatusLabel(campaign?.approvalStatus, lang)}
                </div>
              </div>
              <div
                className="rounded border border-sam-border bg-sam-app/40 px-3 py-2 text-sm"
                data-admin-popup-exposure-status="1"
              >
                <div className="text-xs text-sam-muted">
                  {safeT("admin_platform_popup_exposure_line")}
                </div>
                <div className="font-medium">{promotionOperatorStatusLabel(exposureOp, lang)}</div>
              </div>
            </div>
            {campaign?.ownerStoreId || campaign?.ownerRequestId ? (
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-sam-muted">
                {campaign?.ownerStoreId ? <span>store: {campaign.ownerStoreId}</span> : null}
                {campaign?.ownerRequestId ? <span>request: {campaign.ownerRequestId}</span> : null}
              </div>
            ) : null}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_presentation")}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_presentation_pick_help")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2" data-admin-popup-presentation-picker="1">
              {PLATFORM_POPUP_COMPOSITIONS.map((kind) => {
                const note = compositionContractNote(kind);
                const selected = operatorComposition === kind;
                const benefitDisabled =
                  kind === "benefit_dialog" && !benefitEligible && !eventBenefitLoading;
                return (
                  <AdminListItemButton
                    key={kind}
                    disabled={benefitDisabled}
                    aria-disabled={benefitDisabled}
                    selected={selected}
                    data-admin-popup-composition={kind}
                    data-benefit-dialog-eligible={
                      kind === "benefit_dialog" ? (benefitEligible ? "1" : "0") : undefined
                    }
                    className={`border px-3 text-sm ${
                      benefitDisabled ? "cursor-not-allowed border-sam-border/60" : "border-sam-border"
                    }`}
                    onClick={() => {
                      if (benefitDisabled) return;
                      markDirty();
                      setPresentationType(interruptivePresentationForComposition(kind));
                      setCreativeMode(creativeModeForComposition(kind));
                    }}
                  >
                    <div className="font-semibold">
                      {language === "en" ? note.titleEn : note.titleKo}
                    </div>
                    <div className="mt-0.5 text-xs text-sam-muted">
                      {language === "en" ? note.bodyEn : note.bodyKo}
                    </div>
                    {kind === "benefit_dialog" && benefitDisabled ? (
                      <div className="mt-1 text-xs text-sam-danger" data-benefit-dialog-reason="1">
                        {benefitHintLabel ||
                          safeT("admin_platform_popup_benefit_requires_event_benefit")}
                      </div>
                    ) : null}
                    {kind === "benefit_dialog" && eventBenefitLoading ? (
                      <div className="mt-1 text-xs text-sam-muted">
                        {safeT("admin_platform_popup_benefit_checking")}
                      </div>
                    ) : null}
                  </AdminListItemButton>
                );
              })}
            </div>
            {operatorComposition === "benefit_dialog" || benefitHint !== "none" ? (
              <div
                className="mt-3 rounded border border-sam-warning/30 bg-sam-warning-soft/80 px-3 py-2 text-sm"
                data-admin-popup-benefit-gate="1"
              >
                <p className="text-xs text-sam-muted">
                  {safeT("admin_platform_popup_benefit_contract")}
                </p>
                {benefitHint === "event_link_needed" ? (
                  <p className="mt-1 text-sm text-sam-danger" data-admin-popup-benefit-next="event">
                    {safeT("admin_platform_popup_benefit_need_event")}
                  </p>
                ) : null}
                {benefitHint === "benefit_info_needed" && linkedEventId ? (
                  <p className="mt-1 text-sm" data-admin-popup-benefit-next="benefit">
                    <a
                      href={eventEditHref(linkedEventId)}
                      className="font-medium text-sam-fg underline"
                    >
                      {safeT("admin_platform_popup_benefit_edit_event")}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="mt-3 block text-sm">
              {safeT("admin_platform_popup_frequency_mode")}
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={frequencyMode}
                onChange={(e) => {
                  markDirty();
                  setFrequencyMode(e.target.value);
                }}
                data-admin-popup-frequency="1"
              >
                {PLATFORM_POPUP_FREQUENCY_MODES.map((m) => (
                  <option key={m} value={m}>
                    {popupFrequencyOperatorLabel(m, lang)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-xs text-sam-muted" data-admin-popup-frequency-help="1">
              {/* F-3: 선택한 빈도의 정본 안내문 (팝업·PTR·이벤트 배포 같은 함수) */}
              {popupFrequencyOperatorDescription(frequencyMode, lang, "popup")}
            </p>
            <p className="mt-2 text-xs text-sam-muted" data-admin-popup-composition-note="1">
              {language === "en" ? compositionNote.bodyEn : compositionNote.bodyKo}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_creative")}
            </h2>
            <div
              className="mb-3 rounded border border-sam-border bg-sam-app/60 px-3 py-2 text-sm"
              data-admin-popup-creative-spec="1"
              data-admin-popup-creative-mode={
                operatorComposition === "artwork_modal" ? "artwork" : "card"
              }
            >
              {operatorComposition === "artwork_modal" ? (
                <>
                  <p>
                    {safeT("admin_platform_popup_artwork_spec_geometry")}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {safeT("admin_platform_popup_artwork_spec_note")}
                  </p>
                </>
              ) : operatorComposition === "benefit_dialog" ? (
                <>
                  <p>
                    {safeT("admin_platform_popup_benefit_spec")}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {safeT("admin_platform_popup_benefit_spec_image")}
                  </p>
                </>
              ) : operatorComposition === "bottom_promotion_sheet" ? (
                <>
                  <p>
                    {safeT("admin_platform_popup_sheet_spec")}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {safeT("admin_platform_popup_sheet_spec_safe")}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {safeT("admin_platform_popup_creative_spec_size")}
                  </p>
                  <p>
                    {safeT("admin_platform_popup_creative_spec_ratio")}
                  </p>
                </>
              )}
              <p className="text-xs text-sam-muted">
                {safeT("admin_platform_popup_creative_spec_formats")}
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onPickFile(f);
              }}
            />
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={writeBlocked}
              onClick={() => fileInputRef.current?.click()}
            >
              {safeT("admin_platform_popup_load_image")}
            </AdminActionButton>

            {fileMeta ? (
              <ul className="mt-3 space-y-0.5 text-xs text-sam-muted" data-admin-popup-file-meta="1">
                <li>
                  {fileMeta.fileName} · {(fileMeta.fileSize / 1024).toFixed(1)} KB
                </li>
                <li>
                  {fileMeta.width} × {fileMeta.height} px · ratio {fileMeta.ratio.toFixed(3)}
                  {requiresCardAspect
                    ? fileMeta.ratioOk
                      ? " · 36:25 OK"
                      : " · needs crop"
                    : translateBy(lang, "admin_intrinsic_ok")}
                </li>
              </ul>
            ) : null}

            {requiresCardAspect && needsCrop && pendingCropFile && cropPreviewUrl ? (
              <div className="mt-3 space-y-2 rounded border border-sam-warning/40 bg-sam-warning-soft/80 p-3">
                <p className="text-xs font-medium text-sam-fg">
                  {safeT("admin_platform_popup_crop_confirm")}
                </p>
                {/* Admin crop confirm uses blob URL — raw img OK for ephemeral object URL */}
                <img
                  src={cropPreviewUrl}
                  alt="36:25 crop preview"
                  className="w-full max-w-md border border-sam-border bg-white"
                  style={{ aspectRatio: "36 / 25" }}
                />
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  disabled={writeBlocked}
                  onClick={() => void uploadCreative(pendingCropFile, true)}
                >
                  {safeT("admin_platform_popup_apply_center_crop")}
                </AdminActionButton>
              </div>
            ) : null}

            <label className="mt-3 block text-sm">
              {safeT("admin_platform_popup_alt_text")}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={altText}
                onChange={(e) => {
                  markDirty();
                  setAltText(e.target.value);
                }}
              />
            </label>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_content")}
            </h2>
            <label className="block text-sm">
              {safeT("admin_platform_popup_field_title")}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={promoTitle}
                onChange={(e) => {
                  markDirty();
                  setPromoTitle(e.target.value);
                }}
              />
            </label>
            <label className="mt-3 block text-sm">
              {safeT("admin_platform_popup_field_body")}
              <textarea
                className="mt-1 h-20 w-full rounded border border-sam-border px-2 py-1.5"
                value={promoBody}
                onChange={(e) => {
                  markDirty();
                  setPromoBody(e.target.value);
                }}
              />
            </label>
            <label className="mt-3 block text-sm">
              {safeT("admin_platform_popup_field_cta_label")}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={ctaLabel}
                placeholder={translateBy(language, "admin_e_g_get_benefit")}
                onChange={(e) => {
                  markDirty();
                  setCtaLabel(e.target.value);
                }}
              />
            </label>
            <p className="mt-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_content_live_preview_hint")}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_placement")}
            </h2>
            <p className="mb-3 text-xs text-sam-muted">
              {safeT("admin_platform_popup_placement_system_note")}
            </p>
            <fieldset className="space-y-2" data-admin-popup-surface-select="1">
              {PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((opt) => {
                const selected = isAdminSurfaceSelected(selectedSurfaces, opt.mode);
                const isGlobal = opt.mode === "GLOBAL";
                return (
                  <label
                    key={opt.mode}
                    className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm transition-colors ${
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
            <p className="mt-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_placement_current")}
              {dirty
                ? ` · ${safeT("admin_platform_popup_unsaved")}`
                : ""}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_cta")}
            </h2>
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
            <label className="block text-sm text-sam-muted">
              {safeT("admin_platform_popup_cta_advanced")}
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sam-fg"
                value={ctaType}
                onChange={(e) => {
                  markDirty();
                  const next = e.target.value;
                  setCtaType(next);
                }}
              >
                {PLATFORM_POPUP_CTA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "store"
                      ? translateBy(language, "admin_store")
                      : t === "internal_page"
                        ? translateBy(language, "admin_internal_page")
                        : t === "trade_listing"
                          ? translateBy(language, "admin_trade_listing")
                          : t === "community_post"
                            ? translateBy(language, "admin_community_post")
                            : t === "event_detail"
                              ? translateBy(language, "admin_event_detail")
                              : translateBy(language, "admin_platform_events_field_cta_external_url")}
                  </option>
                ))}
              </select>
            </label>
            {ctaType === "external_url" ? (
              <label className="mt-2 block text-sm">
                HTTPS URL
                <input
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={externalUrl}
                  onChange={(e) => {
                    markDirty();
                    setExternalUrl(e.target.value);
                  }}
                />
              </label>
            ) : (
              <label className="mt-2 block text-sm">
                {translateBy(language, "admin_target_path")}
                <input
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={ctaTarget}
                  onChange={(e) => {
                    markDirty();
                    setCtaTarget(e.target.value);
                  }}
                />
              </label>
            )}
            <p className="mt-1 text-xs text-sam-muted">
              {translateBy(language, "admin_landing")} → {ctaHrefPreview || "(invalid)"}
            </p>
            {ctaHrefPreview ? (
              <AdminDestinationResolvedHint
                href={ctaHrefPreview}
                language={language === "en" ? "en" : "ko"}
              />
            ) : null}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_schedule")}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_schedule_help")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                {translateBy(language, "admin_start_campaign_timezone")}
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
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
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
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
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
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
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={priority}
                  onChange={(e) => {
                    markDirty();
                    setPriority(Number(e.target.value));
                  }}
                />
              </label>
            </div>
          </AdminCard>

          {/*
           * 광고 감사 G-5: 「닫은 뒤 다시 안 보기」(suppression_mode) 입력 칸 제거 — 앱은 이 값을 쓰지 않고
           * 닫기·CTA 뒤 숨김을 「7. 빈도」(frequency_mode) 하나로 정한다(Owner FINAL `dibay-promotion-program-ssot-lock.md`
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
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_reporting")}
            </h2>
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
                  {translateBy(language, "admin_landing_ok")}:{" "}
                  {campaign.eventSummary.landing_success}
                </li>
                <li>
                  {translateBy(language, "admin_landing_fail")}:{" "}
                  {campaign.eventSummary.landing_failure}
                </li>
                <li>
                  {translateBy(language, "admin_eligible")}: {campaign.eventSummary.eligible}
                </li>
              </ul>
              {Object.keys(campaign.eventSummaryBySurface ?? {}).length > 0 ? (
                <div className="mt-3 space-y-1 text-xs" data-admin-popup-surface-breakdown="1">
                  <p className="font-semibold text-sam-fg">
                    {translateBy(language, "admin_by_surface")}
                  </p>
                  {Object.entries(campaign.eventSummaryBySurface).map(([surf, counts]) => {
                    const label =
                      surf === "UNKNOWN"
                        ? translateBy(language, "admin_unknown")
                        : adminSurfaceModeLabel(surf as PlatformPopupAdminSurfaceMode, language === "en" ? "en" : "ko");
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

          <AdminPlatformPopupAuditHistory items={audit} lang={language === "en" ? "en" : "ko"} />
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start" data-admin-popup-preview-sticky="1">
          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_preview")}
            </h2>
            <AdminPlatformPopupPreview source={previewSource} />
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
