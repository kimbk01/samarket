"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import type { PlatformPopupAdminDetail } from "@/lib/platform-popup/admin-campaign-loader";
import {
  PLATFORM_POPUP_CTA_TYPES,
  PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH,
  PLATFORM_POPUP_DEFAULT_TIMEZONE,
  PLATFORM_POPUP_SUPPRESSION_MODES,
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
  popupFrequencyOperatorLabel,
  resolvePopupBenefitOperationalHint,
  popupBenefitHintLabel,
} from "@/lib/admin/promotion-ownership-visibility";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type AuditRow = {
  id: string;
  action: string;
  actor_type: string;
  created_at: string;
  after_json?: unknown;
};

export function AdminPlatformPopupDetailWorkspace({ campaignId }: { campaignId: string }) {
  const { safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaign, setCampaign] = useState<PlatformPopupAdminDetail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const [ctaTarget, setCtaTarget] = useState<string>(PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH);
  const [externalUrl, setExternalUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [promoTitle, setPromoTitle] = useState("");
  const [promoBody, setPromoBody] = useState("");
  const [altText, setAltText] = useState("");
  const [previewOverrideUrl, setPreviewOverrideUrl] = useState<string | null>(null);
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
    setStartLocal(toLocalInput(c.startAt));
    setEndLocal(toLocalInput(c.endAt));
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
    // Legacy drafts may have internal_page + empty target (DB default ''). Heal for edit UX.
    const loadedTarget = String(c.ctaTarget ?? "").trim();
    setCtaTarget(
      loadedTarget ||
        (c.ctaType === "internal_page" ? PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH : "")
    );
    setExternalUrl(c.externalUrl || "");
    setCtaLabel(c.ctaLabel || "");
    setPromoTitle(c.title || "");
    setPromoBody(c.body || "");
    setAltText(c.creative?.altText || "");
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
    const [detailRes, auditRes] = await Promise.all([
      fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, { credentials: "same-origin" }),
      fetch(`/api/admin/platform-popup-campaigns/${campaignId}/audit`, { credentials: "same-origin" }),
    ]);
    const detailJson = (await detailRes.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: PlatformPopupAdminDetail;
      error?: string;
    };
    if (!detailRes.ok || !detailJson.ok || !detailJson.campaign) {
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
    const nextTarget =
      ctaType === "internal_page" && !String(ctaTarget).trim()
        ? PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH
        : ctaTarget;
    if (ctaType === "internal_page" && nextTarget !== ctaTarget) {
      setCtaTarget(nextTarget);
    }
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
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        priority,
        timezone,
        startAt: fromLocalInput(startLocal),
        endAt: fromLocalInput(endLocal),
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
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "save_failed", lang));
      return;
    }
    await load();
    setSaveNotice(
      language === "en" ? "Saved. List and preview reloaded." : "저장되었습니다. 목록·미리보기를 다시 불러왔습니다."
    );
  };

  const transition = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const deleteDraft = async () => {
    const ok = window.confirm(
      language === "en"
        ? "Delete this draft popup? This cannot be undone."
        : "임시저장 팝업을 삭제할까요? 이 작업은 되돌릴 수 없습니다."
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/advertising-workspace/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        family: "platform_popup_campaign",
        entityId: campaignId,
        action: "delete_safe_draft",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(
        formatPlatformPopupAdminError(json.error || "delete_failed", language === "en" ? "en" : "ko")
      );
      return;
    }
    router.push("/admin/advertising");
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
      setError(json.message || "36:25 비율의 이미지를 사용해 주세요.");
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
      setError(
        `이미지 용량이 너무 큽니다. 원본은 ${maxMb}MB 이하로 올려 주세요. (서버에서 1440×1000 WebP로 최적화됩니다)`
      );
      setFileMeta(null);
      return;
    }
    const mime = (file.type || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      setError("JPG, PNG, WEBP 이미지만 사용할 수 있습니다.");
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
        setError("36:25 비율이 아닙니다. 아래 크롭 결과를 확인한 뒤 적용해 주세요.");
        return;
      }
      await uploadCreative(file, false);
    } catch {
      setError("이미지를 읽을 수 없습니다.");
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

  return (
    <div className="space-y-4" data-admin-platform-popup-detail="1">
      <AdminPageHeader
        backHref="/admin/platform-popup"
        title={campaign?.name || "…"}
        description={
          isAdminDirect
            ? safeT("admin_platform_popup_detail_desc_admin_direct", {
                fallbackKo: "캠페인 편집 · 노출 운영 · 프로덕션 렌더러 미리보기",
                fallbackEn: "Edit, operate exposure, and preview with production renderer",
              })
            : safeT("admin_platform_popup_detail_desc", {
                fallbackKo: "캠페인 편집 · 승인 · 프로덕션 렌더러 미리보기",
                fallbackEn: "Edit, approve, and preview with production renderer",
              })
        }
      />

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {saveNotice ? (
        <p
          className="rounded border border-sam-primary/30 bg-sam-primary/5 px-3 py-2 text-sm font-medium text-sam-fg"
          role="status"
          data-admin-popup-save-notice="1"
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
            {lang === "en" ? "Form" : "형태"}:{" "}
            {popupCompositionOperatorLabel(operatorComposition, lang)}
          </span>
          <span data-admin-popup-summary-approval="1">
            {lang === "en" ? "Approval" : "승인"}:{" "}
            {popupApprovalStatusLabel(campaign?.approvalStatus, lang)}
          </span>
          <span data-admin-popup-summary-exposure="1">
            {lang === "en" ? "Exposure" : "노출"}:{" "}
            {promotionOperatorStatusLabel(exposureOp, lang)}
          </span>
          <span data-admin-popup-summary-period="1">
            {lang === "en" ? "Period" : "기간"}:{" "}
            {formatPromotionAdminSchedule(campaign?.startAt ?? null, lang)} –{" "}
            {formatPromotionAdminSchedule(campaign?.endAt ?? null, lang)}
          </span>
          <span data-admin-popup-summary-event="1">
            {lang === "en" ? "Event" : "이벤트"}:{" "}
            {linkedEventId ? linkedEventId.slice(0, 8) : lang === "en" ? "—" : "없음"}
          </span>
          <span data-admin-popup-summary-destination="1">
            {lang === "en" ? "Destination" : "목적지"}:{" "}
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
              {safeT("admin_platform_popup_section_basic", {
                fallbackKo: "1. 기본 정보",
                fallbackEn: "1. Basic info",
              })}
            </h2>
            <label className="block text-sm">
              {safeT("admin_platform_popup_field_name", {
                fallbackKo: "캠페인 이름",
                fallbackEn: "Campaign name",
              })}
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
                  {safeT("admin_platform_popup_approval_line", {
                    fallbackKo: "승인 상태",
                    fallbackEn: "Approval status",
                  })}
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
                  {safeT("admin_platform_popup_exposure_line", {
                    fallbackKo: "노출 상태",
                    fallbackEn: "Exposure status",
                  })}
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
              {safeT("admin_platform_popup_section_presentation", {
                fallbackKo: "2. 팝업 형태",
                fallbackEn: "2. Popup form",
              })}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_presentation_pick_help", {
                fallbackKo:
                  "운영자가 고르는 4가지 형태입니다. 미리보기는 프로덕션과 같은 렌더러를 사용합니다.",
                fallbackEn:
                  "Four operator-facing forms. Preview uses the same production renderer.",
              })}
            </p>
            <div className="grid gap-2 sm:grid-cols-2" data-admin-popup-presentation-picker="1">
              {PLATFORM_POPUP_COMPOSITIONS.map((kind) => {
                const note = compositionContractNote(kind);
                const selected = operatorComposition === kind;
                const benefitDisabled =
                  kind === "benefit_dialog" && !benefitEligible && !eventBenefitLoading;
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={benefitDisabled}
                    aria-disabled={benefitDisabled}
                    data-admin-popup-composition={kind}
                    data-benefit-dialog-eligible={
                      kind === "benefit_dialog" ? (benefitEligible ? "1" : "0") : undefined
                    }
                    className={`rounded border px-3 py-2 text-left text-sm ${
                      benefitDisabled
                        ? "cursor-not-allowed border-sam-border/60 opacity-50"
                        : selected
                          ? "border-sam-fg bg-sam-fg/5"
                          : "border-sam-border"
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
                          safeT("admin_platform_popup_benefit_requires_event_benefit", {
                            fallbackKo:
                              "혜택 다이얼로그는 연결된 이벤트에 혜택 정보가 있을 때 사용할 수 있습니다.",
                            fallbackEn:
                              "Benefit dialog requires linked Event Benefit content.",
                          })}
                      </div>
                    ) : null}
                    {kind === "benefit_dialog" && eventBenefitLoading ? (
                      <div className="mt-1 text-xs text-sam-muted">
                        {safeT("admin_platform_popup_benefit_checking", {
                          fallbackKo: "이벤트 혜택 확인 중…",
                          fallbackEn: "Checking Event benefit…",
                        })}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {operatorComposition === "benefit_dialog" || benefitHint !== "none" ? (
              <div
                className="mt-3 rounded border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm"
                data-admin-popup-benefit-gate="1"
              >
                <p className="text-xs text-sam-muted">
                  {safeT("admin_platform_popup_benefit_contract", {
                    fallbackKo:
                      "혜택 다이얼로그는 연결된 이벤트에 혜택 정보가 있을 때 사용할 수 있습니다.",
                    fallbackEn:
                      "Benefit dialog is available when the linked Event has Benefit content.",
                  })}
                </p>
                {benefitHint === "event_link_needed" ? (
                  <p className="mt-1 text-sm text-sam-danger" data-admin-popup-benefit-next="event">
                    {safeT("admin_platform_popup_benefit_need_event", {
                      fallbackKo: "이벤트 연결 필요 — 아래에서 목적지를 이벤트로 선택하세요.",
                      fallbackEn: "Event link required — set destination to an Event below.",
                    })}
                  </p>
                ) : null}
                {benefitHint === "benefit_info_needed" && linkedEventId ? (
                  <p className="mt-1 text-sm" data-admin-popup-benefit-next="benefit">
                    <a
                      href={eventEditHref(linkedEventId)}
                      className="font-medium text-sam-fg underline"
                    >
                      {safeT("admin_platform_popup_benefit_edit_event", {
                        fallbackKo: "이벤트 혜택 수정",
                        fallbackEn: "Edit Event Benefit",
                      })}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="mt-3 block text-sm">
              {safeT("admin_platform_popup_frequency_mode", {
                fallbackKo: "노출 빈도",
                fallbackEn: "Frequency",
              })}
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={frequencyMode}
                onChange={(e) => {
                  markDirty();
                  setFrequencyMode(e.target.value);
                }}
                data-admin-popup-frequency="1"
              >
                <option value="once_per_session">
                  {popupFrequencyOperatorLabel("once_per_session", lang)}
                </option>
                <option value="once_per_day">
                  {popupFrequencyOperatorLabel("once_per_day", lang)}
                </option>
                <option value="once_campaign">
                  {popupFrequencyOperatorLabel("once_campaign", lang)}
                </option>
                <option value="close_only">
                  {popupFrequencyOperatorLabel("close_only", lang)}
                </option>
              </select>
            </label>
            <p className="mt-2 text-xs text-sam-muted" data-admin-popup-composition-note="1">
              {language === "en" ? compositionNote.bodyEn : compositionNote.bodyKo}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_creative", {
                fallbackKo:
                  operatorComposition === "artwork_modal"
                    ? "4. 소재 (아트워크 · 고유 비율 · contain)"
                    : operatorComposition === "benefit_dialog"
                      ? "4. 소재 (혜택 · 이벤트 혜택 우선)"
                      : operatorComposition === "bottom_promotion_sheet"
                        ? "4. 소재 (하단 시트)"
                        : "4. 소재 (카드 · 1440×1000 · 36:25)",
                fallbackEn:
                  operatorComposition === "artwork_modal"
                    ? "4. Creative (Artwork · intrinsic · contain)"
                    : operatorComposition === "benefit_dialog"
                      ? "4. Creative (Benefit · Event benefit first)"
                      : operatorComposition === "bottom_promotion_sheet"
                        ? "4. Creative (Bottom sheet)"
                        : "4. Creative (Card · 1440×1000 · 36:25)",
              })}
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
                    {safeT("admin_platform_popup_artwork_spec_geometry", {
                      fallbackKo: "비율  고유(intrinsic) · 표시  contain · 투명 PNG 권장",
                      fallbackEn: "Geometry  intrinsic · display  contain · transparent PNG recommended",
                    })}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {safeT("admin_platform_popup_artwork_spec_note", {
                      fallbackKo: "36:25 강제 크롭이 없습니다. 고해상도 원본을 권장합니다.",
                      fallbackEn: "No forced 36:25 crop. High-resolution source recommended.",
                    })}
                  </p>
                </>
              ) : operatorComposition === "benefit_dialog" ? (
                <>
                  <p>
                    {safeT("admin_platform_popup_benefit_spec", {
                      fallbackKo: "혜택 내용은 연결된 이벤트 혜택 섹션이 권위입니다.",
                      fallbackEn: "Benefit copy is owned by the linked Event Benefit section.",
                    })}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {safeT("admin_platform_popup_benefit_spec_image", {
                      fallbackKo: "이미지는 보조 소재입니다. 이벤트 혜택을 복제하지 않습니다.",
                      fallbackEn: "Image is supporting creative. Do not clone Event Benefit fields here.",
                    })}
                  </p>
                </>
              ) : operatorComposition === "bottom_promotion_sheet" ? (
                <>
                  <p>
                    {safeT("admin_platform_popup_sheet_spec", {
                      fallbackKo: "하단 노출 · 내용 높이에 맞춤 · 이미지·내용·CTA 구성",
                      fallbackEn: "Bottom anchored · content-driven height · image + copy + CTA",
                    })}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {safeT("admin_platform_popup_sheet_spec_safe", {
                      fallbackKo: "하단 여백은 앱이 자동으로 처리합니다.",
                      fallbackEn: "Bottom inset is handled automatically by the app.",
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {safeT("admin_platform_popup_creative_spec_size", {
                      fallbackKo: `권장 원본  ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width} × ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height} px`,
                      fallbackEn: `Recommended source  ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width} × ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height} px`,
                    })}
                  </p>
                  <p>
                    {safeT("admin_platform_popup_creative_spec_ratio", {
                      fallbackKo: "비율  36 : 25 · 표시  cover",
                      fallbackEn: "Aspect  36 : 25 · display  cover",
                    })}
                  </p>
                </>
              )}
              <p className="text-xs text-sam-muted">
                {safeT("admin_platform_popup_creative_spec_formats", {
                  fallbackKo: `지원 형식  ${PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS.join(" / ")} · 원본 최대 ${Math.round(POPUP_CREATIVE_SOURCE_MAX_BYTES / (1024 * 1024))}MB`,
                  fallbackEn: `Formats  ${PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS.join(" / ")} · source max ${Math.round(POPUP_CREATIVE_SOURCE_MAX_BYTES / (1024 * 1024))}MB`,
                })}
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
            <button
              type="button"
              className="rounded border border-sam-border bg-white px-3 py-1.5 text-sm font-medium"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {safeT("admin_platform_popup_load_image", {
                fallbackKo: "이미지 불러오기",
                fallbackEn: "Load image",
              })}
            </button>

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
                    : lang === "en"
                      ? " · intrinsic OK"
                      : " · 고유 비율"}
                </li>
              </ul>
            ) : null}

            {requiresCardAspect && needsCrop && pendingCropFile && cropPreviewUrl ? (
              <div className="mt-3 space-y-2 rounded border border-amber-300 bg-amber-50/80 p-3">
                <p className="text-xs font-medium text-amber-900">
                  {safeT("admin_platform_popup_crop_confirm", {
                    fallbackKo: "중앙 크롭 결과 (저장될 최종 이미지)",
                    fallbackEn: "Center-crop result (final asset to save)",
                  })}
                </p>
                {/* Admin crop confirm uses blob URL — raw img OK for ephemeral object URL */}
                <img
                  src={cropPreviewUrl}
                  alt="36:25 crop preview"
                  className="w-full max-w-md border border-sam-border bg-white"
                  style={{ aspectRatio: "36 / 25" }}
                />
                <button
                  type="button"
                  className="rounded border border-amber-600 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void uploadCreative(pendingCropFile, true)}
                >
                  {safeT("admin_platform_popup_apply_center_crop", {
                    fallbackKo: "이 결과로 저장",
                    fallbackEn: "Save this crop",
                  })}
                </button>
              </div>
            ) : null}

            <label className="mt-3 block text-sm">
              {safeT("admin_platform_popup_alt_text", {
                fallbackKo: "대체 텍스트",
                fallbackEn: "Alt text",
              })}
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
              {safeT("admin_platform_popup_section_content", {
                fallbackKo: "5. 내용 / CTA",
                fallbackEn: "5. Copy / CTA",
              })}
            </h2>
            <label className="block text-sm">
              {safeT("admin_platform_popup_field_title", {
                fallbackKo: "제목",
                fallbackEn: "Title",
              })}
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
              {safeT("admin_platform_popup_field_body", {
                fallbackKo: "본문 (선택)",
                fallbackEn: "Body (optional)",
              })}
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
              {safeT("admin_platform_popup_field_cta_label", {
                fallbackKo: "CTA 버튼 문구",
                fallbackEn: "CTA button label",
              })}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={ctaLabel}
                placeholder={language === "en" ? "e.g. Get benefit" : "예: 혜택 받기"}
                onChange={(e) => {
                  markDirty();
                  setCtaLabel(e.target.value);
                }}
              />
            </label>
            <p className="mt-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_content_live_preview_hint", {
                fallbackKo: "변경은 저장 전에도 오른쪽 미리보기에 즉시 반영됩니다.",
                fallbackEn: "Changes update the preview immediately, before Save.",
              })}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_placement", {
                fallbackKo: "6. 노출 위치 / 대상",
                fallbackEn: "6. Surfaces / audience",
              })}
            </h2>
            <p className="mb-3 text-xs text-sam-muted">
              {safeT("admin_platform_popup_placement_system_note", {
                fallbackKo:
                  "결제·통화·위험 작업 화면은 시스템이 잠시 가립니다. 노출 위치와는 별개입니다.",
                fallbackEn:
                  "Payment, call, and high-risk screens are gated by the system — separate from placement.",
              })}
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
                      <span className="mt-0.5 block font-mono text-[11px] text-sam-muted">
                        {language === "en" ? opt.pagesEn : opt.pagesKo}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <p className="mt-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_placement_current", {
                fallbackKo: `현재 선택: ${adminSurfacesSelectionLabel(selectedSurfaces, "ko")}`,
                fallbackEn: `Selected: ${adminSurfacesSelectionLabel(selectedSurfaces, "en")}`,
              })}
              {dirty
                ? ` · ${safeT("admin_platform_popup_unsaved", {
                    fallbackKo: "미저장",
                    fallbackEn: "Unsaved",
                  })}`
                : ""}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_cta", {
                fallbackKo: "3. 연결 콘텐츠 / 목적지",
                fallbackEn: "3. Linked content / destination",
              })}
            </h2>
            {campaign?.ownerStoreId ? (
              <fieldset className="mb-3 space-y-2" data-admin-popup-cta-product="1">
                {(
                  [
                    ["store", "매장으로 이동", "Go to store"],
                    ["menu", "메뉴 섹션으로 이동", "Go to menu section"],
                    ["promotion", "프로모 섹션으로 이동", "Go to promo section"],
                  ] as const
                ).map(([kind, ko, en]) => (
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
                    <span>{language === "en" ? en : ko}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="block text-sm text-sam-muted">
              {safeT("admin_platform_popup_cta_advanced", {
                fallbackKo: "고급 유형 (필요 시)",
                fallbackEn: "Advanced type (optional)",
              })}
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sam-fg"
                value={ctaType}
                onChange={(e) => {
                  markDirty();
                  const next = e.target.value;
                  setCtaType(next);
                  if (next === "internal_page" && !String(ctaTarget).trim()) {
                    setCtaTarget(PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH);
                  }
                }}
              >
                {PLATFORM_POPUP_CTA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "store"
                      ? language === "en"
                        ? "Store"
                        : "매장"
                      : t === "internal_page"
                        ? language === "en"
                          ? "Internal page"
                          : "내부 페이지"
                        : t === "trade_listing"
                          ? language === "en"
                            ? "Trade listing"
                            : "거래 글"
                          : t === "community_post"
                            ? language === "en"
                              ? "Community post"
                              : "커뮤니티 글"
                            : t === "event_detail"
                              ? language === "en"
                                ? "Event detail"
                                : "이벤트 상세"
                              : language === "en"
                                ? "External URL"
                                : "외부 URL"}
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
                {language === "en" ? "Target / path" : "대상 / 경로"}
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
              {language === "en" ? "Landing" : "이동 경로"} → {ctaHrefPreview || "(invalid)"}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_schedule", {
                fallbackKo: "7. 빈도 / 기간",
                fallbackEn: "7. Frequency / period",
              })}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_schedule_help", {
                fallbackKo:
                  "기본 시간대 Asia/Manila. 순위는 영역 지정 > 전체, 그다음 우선순위·시작 시각입니다.",
                fallbackEn:
                  "Default timezone Asia/Manila. Rank: targeted surface > All, then priority and start time.",
              })}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                {language === "en" ? "Start" : "시작"}
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
                {language === "en" ? "End" : "종료"}
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
                {language === "en" ? "Timezone" : "시간대"}
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
                {language === "en" ? "Priority" : "우선순위"}
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

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_suppression", {
                fallbackKo: "닫은 뒤 다시 안 보기",
                fallbackEn: "Don’t show again",
              })}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_suppression_help", {
                fallbackKo:
                  "오늘 하루 보지 않기 = 캠페인 시간대 기준 그날 끝(24시간이 아님). 닫기만으로는 세션 숨김이 아닙니다.",
                fallbackEn:
                  "Today = end of campaign calendar day (not 24h). Close alone is not a session hide.",
              })}
            </p>
            <select
              className="w-full rounded border border-sam-border px-2 py-1.5"
              value={suppressionMode}
              onChange={(e) => {
                markDirty();
                setSuppressionMode(e.target.value);
              }}
            >
              {PLATFORM_POPUP_SUPPRESSION_MODES.map((m) => {
                const labels: Record<string, { ko: string; en: string }> = {
                  CLOSE: { ko: "닫기만 (다시 안 보기 없음)", en: "Close only (no suppress)" },
                  SESSION: { ko: "이번 앱 실행 동안", en: "This app session" },
                  TODAY: { ko: "오늘 하루 보지 않기", en: "Don’t show today" },
                  DURATION: { ko: "일정 시간 동안", en: "For a duration" },
                  CAMPAIGN: { ko: "이 캠페인 다시 안 보기", en: "Don’t show this campaign" },
                };
                const L = labels[m] ?? { ko: m, en: m };
                return (
                  <option key={m} value={m}>
                    {language === "en" ? L.en : L.ko}
                  </option>
                );
              })}
            </select>
            {(suppressionMode === "DURATION" || Number(durationSec) > 0) && (
              <label className="mt-2 block text-sm">
                {language === "en" ? "Duration (seconds)" : "시간(초)"}
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={durationSec}
                  onChange={(e) => {
                    markDirty();
                    setDurationSec(e.target.value === "" ? "" : Number(e.target.value));
                  }}
                />
              </label>
            )}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {isAdminDirect
                ? safeT("admin_platform_popup_section_actions_ops", {
                    fallbackKo: "8. 승인 / 노출 관리",
                    fallbackEn: "8. Approval / exposure",
                  })
                : safeT("admin_platform_popup_section_actions", {
                    fallbackKo: "8. 승인 / 노출 관리",
                    fallbackEn: "8. Approval / exposure",
                  })}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-sam-primary px-3 py-1.5 text-sm font-semibold text-sam-on-primary disabled:opacity-50"
                disabled={busy || !dirty}
                onClick={() => void save()}
                data-admin-popup-save="1"
                data-admin-popup-save-state={busy ? "saving" : dirty ? "dirty" : "idle"}
              >
                {busy
                  ? safeT("admin_platform_popup_saving", {
                      fallbackKo: "저장 중…",
                      fallbackEn: "Saving…",
                    })
                  : safeT("admin_platform_popup_save", { fallbackKo: "저장", fallbackEn: "Save" })}
                {dirty && !busy ? " *" : ""}
              </button>
              {!isAdminDirect ? (
                <button
                  type="button"
                  className="rounded border border-sam-border px-3 py-1.5 text-sm"
                  disabled={busy}
                  onClick={() =>
                    void transition({
                      action: "transition",
                      nextStatus: "pending_review",
                      nextApproval: "pending_review",
                    })
                  }
                >
                  {safeT("admin_platform_popup_action_submit_review", {
                    fallbackKo: "검토 요청",
                    fallbackEn: "Submit for review",
                  })}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void transition({ action: "approve", schedule: true })}
                data-admin-popup-schedule="1"
              >
                {isAdminDirect
                  ? safeT("admin_platform_popup_action_schedule", {
                      fallbackKo: "예약 노출",
                      fallbackEn: "Schedule",
                    })
                  : safeT("admin_platform_popup_action_approve_schedule", {
                      fallbackKo: "승인 후 예약 노출",
                      fallbackEn: "Approve → scheduled",
                    })}
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void transition({ action: "approve", activate: true })}
                data-admin-popup-go-live="1"
              >
                {isAdminDirect
                  ? safeT("admin_platform_popup_action_go_live", {
                      fallbackKo: "노출 시작",
                      fallbackEn: "Start exposure",
                    })
                  : safeT("admin_platform_popup_action_approve_active", {
                      fallbackKo: "승인 후 노출 시작",
                      fallbackEn: "Approve → start exposure",
                    })}
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy || status === "paused" || status === "ended" || status === "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "paused" })}
                data-admin-popup-pause="1"
              >
                {safeT("admin_platform_popup_action_pause", {
                  fallbackKo: "노출 중지",
                  fallbackEn: "Stop exposure",
                })}
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy || status !== "paused"}
                onClick={() => void transition({ action: "transition", nextStatus: "active" })}
                data-admin-popup-resume="1"
              >
                {safeT("admin_platform_popup_action_resume", {
                  fallbackKo: "다시 노출",
                  fallbackEn: "Resume",
                })}
              </button>
              <button
                type="button"
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
                disabled={busy || status === "ended" || status === "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "ended" })}
                data-admin-popup-end="1"
              >
                {safeT("admin_platform_popup_action_end", {
                  fallbackKo: "종료",
                  fallbackEn: "End",
                })}
              </button>
              {canDeleteDraft ? (
                <button
                  type="button"
                  className="rounded border border-red-500 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800"
                  disabled={busy}
                  onClick={() => void deleteDraft()}
                  data-admin-popup-delete-draft="1"
                >
                  {safeT("admin_platform_popup_action_delete_draft", {
                    fallbackKo: "삭제",
                    fallbackEn: "Delete",
                  })}
                </button>
              ) : null}
            </div>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_reporting", {
                fallbackKo: "성과",
                fallbackEn: "Performance",
              })}
            </h2>
            {campaign ? (
              <>
              <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <li>
                  {language === "en" ? "Impressions" : "노출"}: {campaign.eventSummary.impression}
                </li>
                <li>
                  {language === "en" ? "Clicks" : "클릭"}: {campaign.eventSummary.click}
                </li>
                <li>
                  CTR:{" "}
                  {campaign.derived.ctr == null ? "—" : `${(campaign.derived.ctr * 100).toFixed(1)}%`}
                </li>
                <li>
                  {language === "en" ? "Dismiss" : "닫기"}: {campaign.eventSummary.dismiss}
                </li>
                <li>
                  {language === "en" ? "Suppress" : "숨김"}: {campaign.eventSummary.suppress}
                </li>
                <li>
                  {language === "en" ? "Landing OK" : "랜딩 성공"}:{" "}
                  {campaign.eventSummary.landing_success}
                </li>
                <li>
                  {language === "en" ? "Landing fail" : "랜딩 실패"}:{" "}
                  {campaign.eventSummary.landing_failure}
                </li>
                <li>
                  {language === "en" ? "Eligible" : "후보"}: {campaign.eventSummary.eligible}
                </li>
              </ul>
              {Object.keys(campaign.eventSummaryBySurface ?? {}).length > 0 ? (
                <div className="mt-3 space-y-1 text-xs" data-admin-popup-surface-breakdown="1">
                  <p className="font-semibold text-sam-fg">
                    {language === "en" ? "By surface" : "노출 영역별"}
                  </p>
                  {Object.entries(campaign.eventSummaryBySurface).map(([surf, counts]) => {
                    const label =
                      surf === "UNKNOWN"
                        ? language === "en"
                          ? "Unknown"
                          : "미상"
                        : adminSurfaceModeLabel(surf as PlatformPopupAdminSurfaceMode, language === "en" ? "en" : "ko");
                    return (
                      <p key={surf} className="text-sam-muted">
                        {label}: {language === "en" ? "imp" : "노출"} {counts.impression ?? 0} ·{" "}
                        {language === "en" ? "clk" : "클릭"} {counts.click ?? 0}
                      </p>
                    );
                  })}
                </div>
              ) : null}
              </>
            ) : null}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">Audit history</h2>
            <ul className="max-h-48 space-y-1 overflow-auto text-xs">
              {audit.length === 0 ? (
                <li className="text-sam-muted">—</li>
              ) : (
                audit.map((row) => (
                  <li key={row.id}>
                    {new Date(row.created_at).toLocaleString()} · {row.action} · {row.actor_type}
                  </li>
                ))
              )}
            </ul>
          </AdminCard>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start" data-admin-popup-preview-sticky="1">
          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_preview", {
                fallbackKo: "9. 미리보기",
                fallbackEn: "9. Preview",
              })}
            </h2>
            <AdminPlatformPopupPreview source={previewSource} />
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
