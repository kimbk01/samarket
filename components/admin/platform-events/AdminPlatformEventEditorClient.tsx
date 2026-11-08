"use client";

import { resolvePlatformEventFinalCtaHref } from "@/lib/platform-events/destination";
import { AdminDestinationResolvedHint } from "@/components/admin/destination/AdminDestinationResolvedHint";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPlatformEventDistributionPanel } from "@/components/admin/platform-events/AdminPlatformEventDistributionPanel";
import { PlatformEventDetailContent } from "@/components/platform-events/PlatformEventDetailContent";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolveEventOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import type {
  PlatformEventRow,
  PlatformEventSection,
  PlatformEventStatus,
} from "@/lib/platform-events/types";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import {
  parsePlatformEventBoardFields,
  platformEventAdminErrorMessage,
  validatePlatformEventCtaDestination,
  validatePlatformEventSchedule,
  validatePlatformEventSectionCtas,
  type PlatformEventLifecycleAction,
} from "@/lib/platform-events/admin-validation";
import { normalizePlatformEventSections } from "@/lib/platform-events/sections";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { PLATFORM_EVENT_CATEGORY_MAX } from "@/lib/platform-events/types";

type Props = { eventId: string | null };

type PreviewTab = "event" | "popup" | "banner";

type SectionKind = PlatformEventSection["type"];

const SECTION_KIND_OPTIONS: { value: SectionKind; key: MessageKey; ko: string; en: string }[] = [
  { value: "text", key: "admin_event_editor_section_kind_text", ko: "본문", en: "Text" },
  { value: "image", key: "admin_event_editor_section_kind_image", ko: "이미지", en: "Image" },
  { value: "benefit", key: "admin_event_editor_section_kind_benefit", ko: "혜택", en: "Benefit" },
  { value: "cta", key: "admin_event_editor_section_kind_cta", ko: "버튼(CTA)", en: "Button (CTA)" },
  { value: "terms", key: "admin_event_editor_section_kind_terms", ko: "유의사항", en: "Terms" },
];

function newSection(kind: SectionKind): PlatformEventSection {
  switch (kind) {
    case "text":
      return { type: "text", body: "" };
    case "image":
      return { type: "image", imageUrl: "" };
    case "benefit":
      return { type: "benefit", title: "" };
    case "cta":
      return { type: "cta", label: "", ctaType: "internal_page", ctaTarget: "/market" };
    case "terms":
    default:
      return { type: "terms", body: "" };
  }
}

const LIFECYCLE_CONFIRM: Record<
  PlatformEventLifecycleAction,
  {
    titleKey: MessageKey;
    titleKo: string;
    titleEn: string;
    descKey: MessageKey;
    descKo: string;
    descEn: string;
    tone: "primary" | "danger";
  }
> = {
  publish: {
    titleKey: "admin_event_editor_confirm_publish_title",
    descKey: "admin_event_editor_confirm_publish_desc",
    titleKo: "이벤트를 게시할까요?",
    titleEn: "Publish this event?",
    descKo: "저장 후 게시됩니다. 노출 시작 시각부터 이벤트 게시판과 상세 화면에 표시됩니다.",
    descEn: "Saves and publishes. It appears on the event board from its start time.",
    tone: "primary",
  },
  unpublish: {
    titleKey: "admin_event_editor_confirm_unpublish_title",
    descKey: "admin_event_editor_confirm_unpublish_desc",
    titleKo: "이벤트 게시를 중지할까요?",
    titleEn: "Unpublish this event?",
    descKo: "회원에게 더 이상 보이지 않으며, 연결된 팝업·배너 노출도 중단됩니다.",
    descEn: "Members can no longer see it; linked popup/banner exposure stops.",
    tone: "danger",
  },
  archive: {
    titleKey: "admin_event_editor_confirm_archive_title",
    descKey: "admin_event_editor_confirm_archive_desc",
    titleKo: "이벤트를 보관할까요?",
    titleEn: "Archive this event?",
    descKo:
      "게시가 중지되고 이벤트 게시판(종료 탭 포함)과 상세 화면에서 숨겨집니다. 다시 게시하면 보관이 해제됩니다.",
    descEn:
      "Unpublishes and hides it from the board (incl. Ended) and detail. Publishing again unarchives.",
    tone: "danger",
  },
};

const CTA_TYPE_OPTIONS = [
  { value: "internal_page", ko: "앱 내부 페이지", en: "In-app page" },
  { value: "store", ko: "매장", en: "Store" },
  { value: "trade_listing", ko: "중고거래 상품", en: "Trade listing" },
  { value: "community_post", ko: "커뮤니티 게시물", en: "Community post" },
  { value: "external_url", ko: "외부 URL", en: "External URL" },
] as const;

async function uploadEventImage(
  kind: "hero" | "section",
  file: File
): Promise<{ url: string; path: string } | { error: string }> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/admin/platform-events/upload-image", {
    method: "POST",
    credentials: "same-origin",
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    path?: string;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.url) {
    return { error: json.error || "upload_failed" };
  }
  return { url: json.url, path: json.path || "" };
}

function emptyDraft(): PlatformEventRow {
  const now = new Date().toISOString();
  return {
    id: "preview",
    title: "",
    subtitle: null,
    heroImageUrl: null,
    heroImagePath: null,
    sections: [],
    terms: null,
    status: "draft",
    startsAt: null,
    endsAt: null,
    timezone: "Asia/Manila",
    ctaLabel: null,
    ctaType: "internal_page",
    ctaTarget: "/market",
    ctaExternalUrl: null,
    publishedAt: null,
    sourceOwnerRequestId: null,
    sourceStoreId: null,
    thumbnailUrl: null,
    sortOrder: 0,
    isPinned: false,
    category: null,
    archivedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function ctaTypeLabel(ctaType: string | null | undefined, lang: "ko" | "en"): string {
  const hit = CTA_TYPE_OPTIONS.find((o) => o.value === ctaType);
  if (!hit) return ctaType || "—";
  return lang === "en" ? hit.en : hit.ko;
}

export function AdminPlatformEventEditorClient({ eventId }: Props) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const isNew = !eventId || eventId === "new";
  const [draft, setDraft] = useState<PlatformEventRow>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  /** 수정 화면 원본 불러오기 실패 — 표준 오류 상태 + [새로고침] (저장 오류 `error` 와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("event");

  const [sections, setSections] = useState<PlatformEventSection[]>([]);
  const [newSectionKind, setNewSectionKind] = useState<SectionKind>("text");
  const [boardColumnsApplied, setBoardColumnsApplied] = useState(true);
  const [mediaBusy, setMediaBusy] = useState(false);
  const heroFileRef = useRef<HTMLInputElement>(null);
  const sectionFileRef = useRef<HTMLInputElement>(null);
  const sectionUploadIndexRef = useRef<number | null>(null);
  const thumbnailFileRef = useRef<HTMLInputElement>(null);
  const distributionRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-events/${encodeURIComponent(eventId!)}`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          event?: PlatformEventRow;
          error?: string;
          boardColumnsApplied?: boolean;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.event) {
          setLoadErr({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
          return;
        }
        setLoadErr(null);
        setBoardColumnsApplied(json.boardColumnsApplied !== false);
        hydrateFromEvent(json.event);
      } catch {
        if (!cancelled) setLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };

    function hydrateFromEvent(ev: PlatformEventRow) {
      setDraft(ev);
      setSections(ev.sections);
    }
  }, [eventId, isNew, reloadKey]);

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash === "#distribution") {
      distributionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (hash === "#preview") {
      setPreviewTab("event");
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, isNew, draft.id]);

  /** Ordered section list → stored jsonb (empty / malformed sections dropped, same as server). */
  const buildSections = useCallback(
    (): PlatformEventSection[] => normalizePlatformEventSections(sections),
    [sections]
  );

  /** Distribution panel benefit (popup benefit presentation) = first benefit section. */
  const firstBenefit = useMemo(() => {
    const b = buildSections().find((x) => x.type === "benefit");
    return b && b.type === "benefit" ? b : null;
  }, [buildSections]);
  const benefitTitle = firstBenefit?.title ?? "";
  const benefitBody = firstBenefit?.body ?? "";

  const updateSection = useCallback((index: number, patch: Record<string, unknown>) => {
    setSections((list) =>
      list.map((sec, i) => (i === index ? ({ ...sec, ...patch } as PlatformEventSection) : sec))
    );
  }, []);
  const moveSection = useCallback((index: number, delta: -1 | 1) => {
    setSections((list) => {
      const to = index + delta;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);
  const removeSection = useCallback((index: number) => {
    setSections((list) => list.filter((_, i) => i !== index));
  }, []);

  const previewEvent = useMemo(() => {
    return { ...draft, sections: buildSections() };
  }, [draft, buildSections]);

  const operatorStatus = useMemo(
    () =>
      resolveEventOperatorStatus({
        status: draft.status,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
      }),
    [draft.status, draft.startsAt, draft.endsAt]
  );

  const isExternalCta = draft.ctaType === "external_url";
  const showOwnerHandoff = Boolean(draft.sourceOwnerRequestId || draft.sourceStoreId);
  const busy = saving || mediaBusy;
  /** G-18: 이벤트 저장·게시·중지·보관 = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/platform-events");
  const actionBlocked = busy || !adminAction.allowed;

  const validateBeforeSave = useCallback((): boolean => {
    if (!draft.title.trim()) {
      setError(
        safeT("admin_platform_events_error_title_required")
      );
      return false;
    }
    if (draft.ctaType) {
      const cta = validatePlatformPopupCta({
        ctaType: draft.ctaType,
        ctaTarget: draft.ctaTarget,
        externalUrl: draft.ctaExternalUrl,
      });
      if (!cta.ok) {
        const msgByError: Record<string, { ko: string; en: string }> = {
          destination_id_required: {
            ko:
              draft.ctaType === "store"
                ? "매장을 선택해 주세요."
                : draft.ctaType === "community_post"
                  ? "게시물을 선택해 주세요."
                  : draft.ctaType === "trade_listing"
                    ? "중고거래 상품을 선택해 주세요."
                    : "이동할 대상을 설정해 주세요.",
            en: "Please select a destination target.",
          },
          external_url_required: {
            ko: "외부 URL을 입력해 주세요.",
            en: "External URL is required.",
          },
          internal_path_required: {
            ko: "이동할 페이지를 설정해 주세요.",
            en: "Please set an in-app page path.",
          },
        };
        const mapped = msgByError[cta.error];
        setError(
          mapped
            ? lang === "en"
              ? mapped.en
              : mapped.ko
            : safeT("admin_platform_events_error_destination")
        );
        return false;
      }
      // Scope B destination contract — what is saved is exactly what openDestination opens.
      const dest = validatePlatformEventCtaDestination({
        ctaType: draft.ctaType,
        ctaTarget: draft.ctaTarget,
        externalUrl: draft.ctaExternalUrl,
      });
      if (!dest.ok) {
        setError(platformEventAdminErrorMessage(dest.error, lang));
        return false;
      }
    }
    const sectionCheck = validatePlatformEventSectionCtas(sections);
    if (!sectionCheck.ok) {
      setError(platformEventAdminErrorMessage(sectionCheck.error, lang));
      return false;
    }
    const schedule = validatePlatformEventSchedule(draft.startsAt, draft.endsAt);
    if (!schedule.ok) {
      setError(platformEventAdminErrorMessage(schedule.error, lang));
      return false;
    }
    const board = parsePlatformEventBoardFields({
      thumbnailUrl: draft.thumbnailUrl ?? null,
      sortOrder: draft.sortOrder ?? 0,
      isPinned: draft.isPinned === true,
      category: draft.category ?? null,
    });
    if (!board.ok) {
      setError(platformEventAdminErrorMessage(board.error, lang));
      return false;
    }
    return true;
  }, [
    draft.title,
    draft.ctaType,
    draft.ctaTarget,
    draft.ctaExternalUrl,
    draft.startsAt,
    draft.endsAt,
    draft.thumbnailUrl,
    draft.sortOrder,
    draft.isPinned,
    draft.category,
    sections,
    safeT,
    lang,
  ]);

  const save = useCallback(
    async (nextStatus?: PlatformEventStatus, action?: PlatformEventLifecycleAction, reason?: string | null) => {
      if (!validateBeforeSave()) return;
      setSaving(true);
      setError(null);
      const sections = buildSections();
      const payload = {
        title: draft.title,
        subtitle: draft.subtitle,
        heroImageUrl: draft.heroImageUrl,
        heroImagePath: draft.heroImagePath,
        sections,
        terms: draft.terms,
        status: nextStatus ?? draft.status,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        timezone: draft.timezone,
        ctaLabel: draft.ctaLabel,
        ctaType: draft.ctaType,
        ctaTarget: draft.ctaTarget,
        ctaExternalUrl: draft.ctaExternalUrl,
        thumbnailUrl: draft.thumbnailUrl ?? null,
        sortOrder: draft.sortOrder ?? 0,
        isPinned: draft.isPinned === true,
        category: draft.category ?? null,
        ...(action ? { action } : {}),
        ...(reason ? { reason } : {}),
      };
      try {
        const res = await fetch(
          isNew
            ? "/api/admin/platform-events"
            : `/api/admin/platform-events/${encodeURIComponent(eventId!)}`,
          {
            method: isNew ? "POST" : "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          event?: PlatformEventRow;
          error?: string;
          boardColumnsApplied?: boolean;
        };
        if (!res.ok || !json.ok || !json.event) {
          setError(json.error ? platformEventAdminErrorMessage(json.error, lang) : "save_failed");
          return;
        }
        setBoardColumnsApplied(json.boardColumnsApplied !== false);
        if (isNew) {
          router.replace(`/admin/platform-events/${encodeURIComponent(json.event.id)}`);
          return;
        }
        setDraft(json.event);
        setSections(json.event.sections);
      } catch {
        setError("save_failed");
      } finally {
        setSaving(false);
      }
    },
    [draft, buildSections, isNew, eventId, router, validateBeforeSave, lang]
  );

  /**
   * Publish / unpublish / archive always pass through confirmAdminAction (동작 표):
   * 게시 = exposeStart(L2, 사유 → API 감사) · 게시 중지 = exposeStop(L1) · 보관 = disable(L1).
   */
  const requestLifecycle = useCallback(
    async (action: PlatformEventLifecycleAction) => {
      const copy = LIFECYCLE_CONFIRM[action];
      const kind: AdminActionKind = action === "publish" ? "exposeStart" : action === "unpublish" ? "exposeStop" : "disable";
      const confirmed = await confirmAdminAction({
        level: adminActionLevel(kind),
        ko: lang !== "en",
        title: safeT(copy.titleKey, { fallbackKo: copy.titleKo, fallbackEn: copy.titleEn }),
        description: safeT(copy.descKey, { fallbackKo: copy.descKo, fallbackEn: copy.descEn }),
        confirmLabel:
          action === "publish"
            ? promotionAdminActionLabel("PUBLISH", lang)
            : action === "unpublish"
              ? promotionAdminActionLabel("PAUSE_STOP", lang)
              : safeT("admin_event_editor_btn_archive"),
        destructive: copy.tone === "danger",
      });
      if (!confirmed.ok) return;
      if (action === "publish") await save("published", "publish", confirmed.reason);
      else if (action === "unpublish") await save("unpublished");
      else await save("unpublished", "archive");
    },
    [save, lang, safeT]
  );

  const onHeroUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const previousUrl = draft.heroImageUrl;
      const previousPath = draft.heroImagePath;
      setMediaBusy(true);
      setError(null);
      try {
        const out = await uploadEventImage("hero", file);
        if ("error" in out) {
          setDraft((d) => ({ ...d, heroImageUrl: previousUrl, heroImagePath: previousPath }));
          setError(out.error);
          return;
        }
        setDraft((d) => ({
          ...d,
          heroImageUrl: out.url,
          heroImagePath: out.path || null,
        }));
      } finally {
        setMediaBusy(false);
        if (heroFileRef.current) heroFileRef.current.value = "";
      }
    },
    [draft.heroImageUrl, draft.heroImagePath]
  );

  const onSectionUpload = useCallback(
    async (file: File | null) => {
      const index = sectionUploadIndexRef.current;
      if (!file || index == null) return;
      setMediaBusy(true);
      setError(null);
      try {
        const out = await uploadEventImage("section", file);
        if ("error" in out) {
          setError(out.error);
          return;
        }
        updateSection(index, { imageUrl: out.url });
      } finally {
        setMediaBusy(false);
        sectionUploadIndexRef.current = null;
        if (sectionFileRef.current) sectionFileRef.current.value = "";
      }
    },
    [updateSection]
  );

  const onThumbnailUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    setMediaBusy(true);
    setError(null);
    try {
      const out = await uploadEventImage("section", file);
      if ("error" in out) {
        setError(out.error);
        return;
      }
      setDraft((d) => ({ ...d, thumbnailUrl: out.url }));
    } finally {
      setMediaBusy(false);
      if (thumbnailFileRef.current) thumbnailFileRef.current.value = "";
    }
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <AdminLoadingState ko={lang === "ko"} />
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="p-4">
        <AdminErrorState
          ko={lang === "ko"}
          code={loadErr.code}
          httpStatus={loadErr.httpStatus}
          onRetry={() => {
            setLoading(true);
            setLoadErr(null);
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  const fieldClass = "mt-1 w-full rounded border border-sam-border px-2 py-1.5";
  const sectionClass =
    "space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4";
  const sectionTitleClass = "text-sm font-semibold text-sam-fg";

  const actionButtons = (
    <>
      {!adminAction.allowed && adminAction.reason ? (
        <span className="text-[12px] text-sam-muted" data-admin-action-denied="1">
          {adminAction.reason}
        </span>
      ) : null}
      <AdminActionButton variant="primary" disabled={actionBlocked} title={adminAction.reason ?? undefined} onClick={() => void save()}>
        {saving
          ? safeT("admin_platform_events_saving")
          : promotionAdminActionLabel("SAVE", lang)}
      </AdminActionButton>
      <AdminActionButton
        variant="primary"
        disabled={actionBlocked}
        onClick={() => void requestLifecycle("publish")}
        data-admin-event-action="publish"
      >
        {promotionAdminActionLabel("PUBLISH", lang)}
      </AdminActionButton>
      <AdminActionButton
        variant="danger"
        disabled={actionBlocked || isNew}
        onClick={() => void requestLifecycle("unpublish")}
        data-admin-event-action="unpublish"
      >
        {promotionAdminActionLabel("PAUSE_STOP", lang)}
      </AdminActionButton>
      <AdminActionButton
        variant="quiet"
        disabled={actionBlocked || isNew || Boolean(draft.archivedAt)}
        onClick={() => void requestLifecycle("archive")}
        data-admin-event-action="archive"
      >
        {safeT("admin_event_editor_btn_archive")}
      </AdminActionButton>
    </>
  );

  return (
    <div className="space-y-4 p-4" data-admin-platform-event-editor="1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 [&>[data-admin-page-header]]:mb-0">
          <AdminPageHeader
            title={
              isNew
                ? safeT("admin_platform_events_create")
                : safeT("admin_platform_events_edit")
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">{actionButtons}</div>
      </div>

      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      {showOwnerHandoff ? (
        <div
          className="rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg"
          data-admin-event-owner-handoff="1"
        >
          {safeT("admin_platform_events_owner_handoff_banner")}
        </div>
      ) : null}

      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface/95 px-3 py-2 backdrop-blur"
        data-admin-event-op-summary="1"
      >
        <AdminToneBadge tone={promotionOperatorStatusTone(operatorStatus)}>
          {promotionOperatorStatusLabel(operatorStatus, lang)}
        </AdminToneBadge>
        {draft.archivedAt ? (
          <AdminToneBadge tone="neutral">{safeT("admin_event_editor_archived_badge")}</AdminToneBadge>
        ) : null}
        <span className="text-xs text-sam-muted">
          {safeT("admin_promotion_schedule_start")}
          : {formatPromotionAdminSchedule(draft.startsAt, lang)}
        </span>
        <span className="text-xs text-sam-muted">
          {safeT("admin_promotion_schedule_end")}
          : {formatPromotionAdminSchedule(draft.endsAt, lang)}
        </span>
        <span className="text-xs text-sam-muted">
          CTA: {draft.ctaLabel?.trim() || "—"} · {ctaTypeLabel(draft.ctaType, lang)}
        </span>
      </div>

      <section className={sectionClass} data-admin-event-section="basic">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_basic")}
        </h2>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_title")}
          <input
            className={fieldClass}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_subtitle")}
          <input
            className={fieldClass}
            value={draft.subtitle ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, subtitle: e.target.value.trim() || null }))
            }
          />
        </label>
        <div className="space-y-2">
          <span className="block text-sm">
            {safeT("admin_platform_events_field_hero")}
          </span>
          <p className="text-xs text-sam-muted">
            {safeT("admin_platform_events_hero_guidance")}
          </p>
          <input
            ref={heroFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-xs"
            disabled={busy}
            onChange={(e) => void onHeroUpload(e.target.files?.[0] ?? null)}
          />
          {draft.heroImageUrl ? (
            <div className="space-y-2">
              <div className="relative aspect-[16/9] w-full max-h-56 overflow-hidden rounded-ui-rect border border-sam-border">
                <SamarketThumbnail
                  src={draft.heroImageUrl}
                  alt=""
                  fill
                  fetchDisplayPx={640}
                  className="h-full w-full"
                  imageClassName="object-cover"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminActionButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => heroFileRef.current?.click()}
                >
                  {safeT("admin_platform_events_hero_replace")}
                </AdminActionButton>
                <AdminActionButton
                  variant="quiet"
                  disabled={busy}
                  onClick={() =>
                    setDraft((d) => ({ ...d, heroImageUrl: null, heroImagePath: null }))
                  }
                >
                  {safeT("admin_platform_events_hero_remove")}
                </AdminActionButton>
              </div>
            </div>
          ) : null}
          {mediaBusy ? (
            <p className="text-xs text-sam-muted">
              {safeT("admin_platform_events_uploading")}
            </p>
          ) : null}
        </div>
      </section>

      <section className={sectionClass} data-admin-event-section="board">
        <h2 className={sectionTitleClass}>{safeT("admin_event_editor_board_section")}</h2>
        {!boardColumnsApplied ? (
          <p className="text-xs text-sam-warning" data-admin-event-board-migration-pending="1">
            {safeT("admin_event_editor_board_migration_pending")}
          </p>
        ) : null}
        <div className="space-y-2">
          <span className="block text-sm">{safeT("admin_event_editor_board_thumbnail")}</span>
          <p className="text-xs text-sam-muted">
            {safeT("admin_event_editor_board_thumbnail_help")}
          </p>
          <input
            className={fieldClass}
            value={draft.thumbnailUrl ?? ""}
            placeholder="https://"
            onChange={(e) => setDraft((d) => ({ ...d, thumbnailUrl: e.target.value.trim() || null }))}
          />
          <input
            ref={thumbnailFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-xs"
            disabled={busy}
            onChange={(e) => void onThumbnailUpload(e.target.files?.[0] ?? null)}
          />
          {draft.thumbnailUrl ? (
            <div className="relative aspect-[2/1] w-full max-w-sm overflow-hidden rounded-ui-rect border border-sam-border">
              <SamarketThumbnail
                src={draft.thumbnailUrl}
                alt=""
                fill
                fetchDisplayPx={640}
                className="h-full w-full"
                imageClassName="object-cover"
              />
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block text-sm">
            {safeT("admin_event_editor_board_category")}
            <input
              className={fieldClass}
              maxLength={PLATFORM_EVENT_CATEGORY_MAX}
              value={draft.category ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value || null }))}
            />
          </label>
          <label className="block text-sm">
            {safeT("admin_event_editor_board_sort_order")}
            <input
              type="number"
              step={1}
              className={fieldClass}
              value={String(draft.sortOrder ?? 0)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, sortOrder: e.target.value === "" ? 0 : Number(e.target.value) }))
              }
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={draft.isPinned === true}
              onChange={(e) => setDraft((d) => ({ ...d, isPinned: e.target.checked }))}
            />
            {safeT("admin_event_editor_board_pin")}
          </label>
        </div>
      </section>

      <section className={sectionClass} data-admin-event-section="content">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_content")}
        </h2>
        <input
          ref={sectionFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={busy}
          onChange={(e) => void onSectionUpload(e.target.files?.[0] ?? null)}
        />
        {sections.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("admin_event_editor_sections_empty")}
          </p>
        ) : null}
        <ol className="space-y-3" data-admin-event-sections="1">
          {sections.map((sec, index) => {
            const kindLabel = SECTION_KIND_OPTIONS.find((o) => o.value === sec.type);
            return (
              <li
                key={index}
                className="space-y-2 rounded-ui-rect border border-dashed border-sam-border p-3"
                data-admin-event-section-item={sec.type}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-sam-muted">
                    {index + 1}. {kindLabel ? safeT(kindLabel.key, { fallbackKo: kindLabel.ko, fallbackEn: kindLabel.en }) : sec.type}
                  </span>
                  <div className="flex gap-1">
                    <AdminActionButton
                      variant="quiet"
                      disabled={busy || index === 0}
                      onClick={() => moveSection(index, -1)}
                      aria-label={safeT("admin_event_editor_section_move_up")}
                    >
                      ↑
                    </AdminActionButton>
                    <AdminActionButton
                      variant="quiet"
                      disabled={busy || index === sections.length - 1}
                      onClick={() => moveSection(index, 1)}
                      aria-label={safeT("admin_event_editor_section_move_down")}
                    >
                      ↓
                    </AdminActionButton>
                    <AdminActionButton variant="quiet" disabled={busy} onClick={() => removeSection(index)}>
                      {safeT("admin_event_editor_section_remove")}
                    </AdminActionButton>
                  </div>
                </div>
                {sec.type === "text" ? (
                  <>
                    <input
                      className={fieldClass}
                      placeholder={safeT("admin_event_editor_section_heading_ph")}
                      value={sec.title ?? ""}
                      onChange={(e) => updateSection(index, { title: e.target.value })}
                    />
                    <textarea
                      className={`${fieldClass} h-28`}
                      placeholder={safeT("admin_event_editor_section_body_ph")}
                      value={sec.body}
                      onChange={(e) => updateSection(index, { body: e.target.value })}
                    />
                  </>
                ) : sec.type === "image" ? (
                  <>
                    <input
                      className={fieldClass}
                      placeholder="https://"
                      value={sec.imageUrl}
                      onChange={(e) => updateSection(index, { imageUrl: e.target.value.trim() })}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminActionButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          sectionUploadIndexRef.current = index;
                          sectionFileRef.current?.click();
                        }}
                      >
                        {safeT("admin_platform_events_field_section_image")}
                      </AdminActionButton>
                      <input
                        className={`${fieldClass} mt-0 flex-1`}
                        placeholder={safeT("admin_event_editor_section_alt_ph")}
                        value={sec.alt ?? ""}
                        onChange={(e) => updateSection(index, { alt: e.target.value })}
                      />
                    </div>
                    {/^https?:\/\//i.test(sec.imageUrl) ? (
                      <div className="relative aspect-[16/9] w-full max-w-sm overflow-hidden rounded-ui-rect border border-sam-border">
                        <SamarketThumbnail
                          src={sec.imageUrl}
                          alt=""
                          fill
                          fetchDisplayPx={640}
                          className="h-full w-full"
                          imageClassName="object-cover"
                        />
                      </div>
                    ) : null}
                  </>
                ) : sec.type === "benefit" ? (
                  <>
                    <input
                      className={fieldClass}
                      placeholder={safeT("admin_platform_events_field_benefit_title")}
                      value={sec.title}
                      onChange={(e) => updateSection(index, { title: e.target.value })}
                    />
                    <textarea
                      className={`${fieldClass} h-20`}
                      placeholder={safeT("admin_platform_events_field_benefit_body")}
                      value={sec.body ?? ""}
                      onChange={(e) => updateSection(index, { body: e.target.value })}
                    />
                  </>
                ) : sec.type === "cta" ? (
                  <>
                    <input
                      className={fieldClass}
                      placeholder={safeT("admin_event_editor_section_cta_label_ph")}
                      value={sec.label}
                      onChange={(e) => updateSection(index, { label: e.target.value })}
                    />
                    <select
                      className={fieldClass}
                      value={sec.ctaType}
                      onChange={(e) => updateSection(index, { ctaType: e.target.value })}
                    >
                      {CTA_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {lang === "en" ? opt.en : opt.ko}
                        </option>
                      ))}
                    </select>
                    {sec.ctaType === "external_url" ? (
                      <input
                        className={fieldClass}
                        placeholder="https://"
                        value={sec.externalUrl ?? ""}
                        onChange={(e) => updateSection(index, { externalUrl: e.target.value.trim() })}
                      />
                    ) : (
                      <input
                        className={fieldClass}
                        placeholder={safeT("admin_event_editor_section_cta_target_ph")}
                        value={sec.ctaTarget ?? ""}
                        onChange={(e) => updateSection(index, { ctaTarget: e.target.value })}
                      />
                    )}
                  </>
                ) : (
                  <textarea
                    className={`${fieldClass} h-20`}
                    placeholder={safeT("admin_event_editor_section_terms_ph")}
                    value={sec.body}
                    onChange={(e) => updateSection(index, { body: e.target.value })}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={newSectionKind}
            onChange={(e) => setNewSectionKind(e.target.value as SectionKind)}
            aria-label={safeT("admin_event_editor_section_type")}
          >
            {SECTION_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {safeT(opt.key, { fallbackKo: opt.ko, fallbackEn: opt.en })}
              </option>
            ))}
          </select>
          <AdminActionButton
            variant="secondary"
            disabled={busy}
            onClick={() => setSections((list) => [...list, newSection(newSectionKind)])}
            data-admin-event-section-add="1"
          >
            {safeT("admin_event_editor_section_add")}
          </AdminActionButton>
        </div>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_terms")}
          <textarea
            className={`${fieldClass} h-24`}
            value={draft.terms ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, terms: e.target.value.trim() || null }))
            }
          />
        </label>
      </section>

      <section className={sectionClass} data-admin-event-section="destination">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_destination")}
        </h2>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_cta_label")}
          <input
            className={fieldClass}
            value={draft.ctaLabel ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, ctaLabel: e.target.value.trim() || null }))
            }
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_cta_type")}
          <select
            className={fieldClass}
            value={draft.ctaType ?? "internal_page"}
            onChange={(e) => setDraft((d) => ({ ...d, ctaType: e.target.value }))}
          >
            {CTA_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {lang === "en" ? opt.en : opt.ko}
              </option>
            ))}
          </select>
        </label>
        {isExternalCta ? (
          <label className="block text-sm">
            {safeT("admin_platform_events_field_cta_external_url")}
            <input
              className={fieldClass}
              value={draft.ctaExternalUrl ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  ctaExternalUrl: e.target.value.trim() || null,
                }))
              }
              placeholder="https://"
            />
          </label>
        ) : (
          <label className="block text-sm">
            {safeT("admin_platform_events_field_cta_target")}
            <input
              className={fieldClass}
              value={draft.ctaTarget}
              onChange={(e) => setDraft((d) => ({ ...d, ctaTarget: e.target.value }))}
            />
          </label>
        )}
        {draft.ctaType ? (
          <AdminDestinationResolvedHint
            href={(() => {
              const r = resolvePlatformEventFinalCtaHref({
                ctaType: draft.ctaType,
                ctaTarget: draft.ctaTarget,
                externalUrl: draft.ctaExternalUrl,
              });
              return r.ok ? r.href : (isExternalCta ? draft.ctaExternalUrl : draft.ctaTarget) || "";
            })()}
            language={lang}
          />
        ) : null}
      </section>

      <section className={sectionClass} data-admin-event-section="schedule">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_schedule")}
        </h2>
        <p className="text-xs text-sam-muted">
          {safeT("admin_platform_events_schedule_tz_note")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            {safeT("ads_f_start_pht")}
            <input
              type="datetime-local"
              className={fieldClass}
              value={toLocalInput(draft.startsAt)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, startsAt: fromLocalInput(e.target.value) }))
              }
            />
          </label>
          <label className="block text-sm">
            {safeT("ads_f_end_pht")}
            <input
              type="datetime-local"
              className={fieldClass}
              value={toLocalInput(draft.endsAt)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, endsAt: fromLocalInput(e.target.value) }))
              }
            />
          </label>
        </div>
      </section>

      <section
        ref={distributionRef}
        id="distribution"
        className={sectionClass}
        data-admin-event-section="distribution"
      >
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_distribution")}
        </h2>
        {!isNew ? (
          <AdminPlatformEventDistributionPanel
            eventId={draft.id}
            eventTitle={draft.title || "Event"}
            eventStatus={draft.status}
            eventStartsAt={draft.startsAt}
            eventEndsAt={draft.endsAt}
            benefitTitle={benefitTitle}
            benefitBody={benefitBody}
            heroImageUrl={draft.heroImageUrl}
          />
        ) : (
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_events_distribution_save_first")}
          </p>
        )}
      </section>

      <section
        ref={previewRef}
        id="preview"
        className={sectionClass}
        data-admin-event-section="preview"
      >
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_preview")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                id: "event" as const,
                ko: "이벤트 페이지",
                en: "Event page",
              },
              { id: "popup" as const, ko: "팝업", en: "Popup" },
              { id: "banner" as const, ko: "배너", en: "Banner" },
            ] as const
          ).map((tab) => (
            <AdminActionButton
              key={tab.id}
              variant={previewTab === tab.id ? "primary" : "secondary"}
              onClick={() => setPreviewTab(tab.id)}
            >
              {lang === "en" ? tab.en : tab.ko}
            </AdminActionButton>
          ))}
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted">
          {previewTab === "event" ? (
            <div className="max-h-[80vh] overflow-auto bg-sam-app">
              {previewEvent.title ? (
                <PlatformEventDetailContent
                  event={previewEvent}
                  language={language === "en" ? "en" : "ko"}
                />
              ) : (
                <p className="p-4 text-sm text-sam-muted">—</p>
              )}
            </div>
          ) : isNew ? (
            <p className="p-4 text-sm text-sam-muted">
              {safeT("admin_platform_events_preview_dist_after_save")}
            </p>
          ) : (
            <p className="p-4 text-sm text-sam-muted">
              {safeT("admin_platform_events_preview_use_dist_panel")}
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pb-6">{actionButtons}</div>

    </div>
  );
}

/** CX-16: 칸은 「표시 기준 시간대: Asia/Manila」 그대로 PHT 벽시계 — 브라우저 시간대로 바꾸지 않는다 */
export function toLocalInput(iso: string | null): string {
  return adminIsoToManilaInput(iso);
}

export function fromLocalInput(v: string): string | null {
  return adminManilaInputToIso(v) ?? null;
}
