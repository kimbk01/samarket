"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import type { CampaignSendMode } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import {
  BOARD_LABEL,
  parseCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { CampaignActionConfirmDialog } from "@/components/admin/notifications/CampaignActionConfirmDialog";
import { notifChannelLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import {
  formatCampaignTime,
  type CampaignConfirmAction,
  type CampaignConfirmFacts,
} from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";
import { campaignStatusLabel } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { readSelectedUserIdsFromPayload } from "@/lib/admin/notification-campaigns/selected-user-ids";
import {
  campaignCreateErrorMessage,
  campaignCreateMissingForDraft,
  campaignCreateMissingForSend,
  isCampaignSourcePickable,
  parseCampaignUserIds,
  type CampaignCreateMissingItem,
} from "@/lib/admin/notification-campaigns/campaign-create-form";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

type Channel = "push_only" | "in_app_only" | "push_and_in_app" | "test_only";
type RecurrenceKind = "daily" | "weekly" | "monthly";
type CampaignType = "notice" | "marketing" | "system";
type PreviewTab = "android" | "ios" | "in_app";

type LinkedContent = {
  id: string;
  content_type: string;
  title: string;
  hero_image_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

type NoticePickRow = {
  id: string;
  title: string;
  body?: string | null;
  content_type?: string | null;
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
  hero_image_url?: string | null;
};

/** 반복 발송 기본 시간대 = 운영 기준 PHT. 기존 캠페인은 저장된 시간대를 그대로 유지한다. */
const DEFAULT_RECURRENCE_TIMEZONE = "Asia/Manila";
const TITLE_GUIDE_MAX = 50;
const BODY_GUIDE_MAX = 120;

async function uploadCampaignImage(kind: "push" | "in_app", file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/admin/notification-campaigns/upload-image", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string };
  return res.ok && j.ok && j.url ? j.url : null;
}

function readCampaignContentId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

function newClientIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const fieldClass = "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-2 text-sm";
const sectionClass = "scroll-mt-4 space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4";

export function AdminNotificationCampaignCreatePage() {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminMe } = useAdminShell();
  const lang = language === "en" ? "en" : "ko";
  const tx = (ko: string, en: string) => (lang === "ko" ? ko : en);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<CampaignType>("notice");
  const [channel, setChannel] = useState<Channel>("push_and_in_app");
  const [targetType, setTargetType] = useState<string>("all");
  const [deeplinkUrl, setDeeplinkUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [pushImageUrl, setPushImageUrl] = useState("");
  const [inAppImageUrl, setInAppImageUrl] = useState("");
  /** 인앱 이미지를 푸시와 다르게 쓸 때만 켠다 (기본 = 한 장 공용). */
  const [separateInAppImage, setSeparateInAppImage] = useState(false);
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [testUserIds, setTestUserIds] = useState("");
  const [appNoticeId, setAppNoticeId] = useState("");
  const [linkedContent, setLinkedContent] = useState<LinkedContent | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerRows, setPickerRows] = useState<NoticePickRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** 생성은 됐지만 발송 요청이 실패한 캠페인 — 중복 생성을 막고 상세로 안내한다. */
  const [createdUnsentId, setCreatedUnsentId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("android");
  // ADM-04: the create form doubles as the edit form (`?edit=<campaignId>`).
  const editId = searchParams.get("edit")?.trim() ?? "";
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editBlocked, setEditBlocked] = useState<string | null>(null);
  /** 수정 모드 원본 불러오기 — 표준 로딩·오류 상태 (없는 캠페인은 기존 `editBlocked` 안내) */
  const [editLoading, setEditLoading] = useState(Boolean(searchParams.get("edit")?.trim()));
  const [editLoadErr, setEditLoadErr] = useState<AdminLoadFailure | null>(null);
  const [editReloadKey, setEditReloadKey] = useState(0);
  const [confirm, setConfirm] = useState<{
    action: CampaignConfirmAction;
    facts: CampaignConfirmFacts;
    /** L3(발송) 확인창 사유 — 발송 API 로 보내 감사에 남긴다. L1 동작은 null. */
    run: (reason: string | null) => Promise<void>;
  } | null>(null);
  // IA-01: 실제 수신자 발송·예약(그리고 예약·일시정지 캠페인 수정) = `manage` 키 (접근표 /admin/notifications action).
  // 초안 저장·본인 테스트 발송은 그대로. 서버 가드가 최종 판정.
  const sendAction = useAdminRouteAction("/admin/notifications");
  const [sendMode, setSendMode] = useState<CampaignSendMode>("immediate");
  /** datetime-local 값 = PHT (`adminManilaInputToIso` 로 저장). */
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>("weekly");
  const [recurrenceTime, setRecurrenceTime] = useState("09:00");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceStartAt, setRecurrenceStartAt] = useState("");
  const [recurrenceEndAt, setRecurrenceEndAt] = useState("");
  const [recurrenceTimezone, setRecurrenceTimezone] = useState(DEFAULT_RECURRENCE_TIMEZONE);
  const [audience, setAudience] = useState<CampaignAudiencePreview | null>(null);
  /** 테스트 발송용 QA 캠페인 — 같은 화면에서 다시 테스트하면 새로 만들지 않고 고쳐서 재사용한다. */
  const testCampaignIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (searchParams.get("edit")) return;
    const qType = searchParams.get("type");
    if (qType === "notice" || qType === "marketing" || qType === "system") setType(qType);
    // Optional draft only — never treat query body as Board original authority.
    const qTitle = searchParams.get("title");
    if (qTitle) setTitle(qTitle);
    const qBody = searchParams.get("body");
    if (qBody) setBody(qBody);
    const qDeeplink = searchParams.get("deeplink");
    if (qDeeplink) setDeeplinkUrl(qDeeplink);
    const qNotice = searchParams.get("appNoticeId");
    if (qNotice) setAppNoticeId(qNotice);
  }, [searchParams]);

  // ADM-04 edit mode: hydrate the form from the stored campaign (draft · scheduled · paused only).
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setEditLoading(true);
      try {
        const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(editId)}`, {
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          campaign?: Record<string, unknown>;
          allowed_actions?: string[];
          effective_status?: string;
        };
        if (cancelled) return;
        if (!res.ok || !j.ok || !j.campaign) {
          setEditBlocked(t("admin_notif_not_found"));
          // 404 = 없는 캠페인(기존 안내 유지) · 그 외 = 불러오기 실패 상태 + [새로고침]
          if (res.status !== 404) {
            setEditLoadErr({ code: adminSafeErrorCode(j.error), httpStatus: res.status });
          }
          return;
        }
        setEditLoadErr(null);
        setEditBlocked(null);
        const c = j.campaign;
        const status = typeof j.effective_status === "string" ? j.effective_status : String(c.status ?? "");
        setEditStatus(status);
        if (!Array.isArray(j.allowed_actions) || !j.allowed_actions.includes("edit")) {
          setEditBlocked(
            safeT("admin_campaign_cms_edit_blocked", {
              fallbackKo: "이 알림은 더 이상 수정할 수 없습니다. 상세 화면에서 「복제」 후 새로 작성하세요.",
              fallbackEn: "This notification can no longer be edited. Duplicate it from the detail page instead.",
            })
          );
        }
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        setTitle(str(c.title));
        setBody(str(c.body));
        const typ = str(c.type);
        if (typ === "notice" || typ === "marketing" || typ === "system") setType(typ);
        const ch = str(c.channel);
        if (ch === "push_only" || ch === "in_app_only" || ch === "push_and_in_app" || ch === "test_only") {
          setChannel(ch);
        }
        setTargetType(str(c.target_type) || "all");
        setDeeplinkUrl(str(c.deeplink_url) || str(c.target_url));
        setWebUrl(str(c.web_url));
        const pushImg = str(c.push_image_url);
        const inAppImg = str(c.in_app_image_url);
        setPushImageUrl(pushImg);
        setInAppImageUrl(inAppImg);
        setSeparateInAppImage(Boolean(inAppImg) && inAppImg !== pushImg);
        setRegionCode(str(c.segment_region_code));
        setSelectedIds(readSelectedUserIdsFromPayload(c.target_payload).join("\n"));
        setAppNoticeId(readCampaignContentId(c.target_payload));
        const mode = str(c.send_mode);
        setSendMode(mode === "scheduled" || mode === "recurring" ? mode : "immediate");
        setScheduledAt(adminIsoToManilaInput(str(c.scheduled_at)));
        const rk = str(c.recurrence_kind);
        if (rk === "daily" || rk === "weekly" || rk === "monthly") setRecurrenceKind(rk);
        if (str(c.recurrence_time)) setRecurrenceTime(str(c.recurrence_time).slice(0, 5));
        if (typeof c.recurrence_weekday === "number") setRecurrenceWeekday(c.recurrence_weekday);
        if (str(c.recurrence_timezone)) setRecurrenceTimezone(str(c.recurrence_timezone));
        setRecurrenceStartAt(adminIsoToManilaInput(str(c.recurrence_start_at)));
        setRecurrenceEndAt(adminIsoToManilaInput(str(c.recurrence_end_at)));
      } catch {
        if (!cancelled) setEditLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) {
          setBusy(false);
          setEditLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `t`/`lang` omitted on purpose: hydrate once per campaign id (i18n boot recreates `t`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, editReloadKey]);

  /** ADM-04: scheduled keeps `scheduled`, paused keeps `recurring`; drafts may pick any mode. */
  const sendModeAllowed = (mode: CampaignSendMode) => {
    if (!editId || !editStatus) return true;
    if (editStatus === "scheduled") return mode === "scheduled";
    if (editStatus === "paused") return mode === "recurring";
    return true;
  };

  const loadLinkedContent = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) {
      setLinkedContent(null);
      return;
    }
    setLinkedLoading(true);
    try {
      const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(trimmed)}`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notice?: LinkedContent;
      };
      if (res.ok && j.ok && j.notice) {
        setLinkedContent(j.notice);
        const ct = parseCustomerCenterContentType(j.notice.content_type, "notice");
        setType(ct);
        // Bind identity only — never auto-fill campaign title/body from board original.
        setDeeplinkUrl(buildCustomerCenterBoardDetailPath(ct, j.notice.id));
      } else {
        setLinkedContent(null);
      }
    } finally {
      setLinkedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinkedContent(appNoticeId);
  }, [appNoticeId, loadLinkedContent]);

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await fetch("/api/admin/app-notices", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notices?: NoticePickRow[];
      };
      setPickerRows(res.ok && j.ok && Array.isArray(j.notices) ? j.notices : []);
    } finally {
      setPickerLoading(false);
    }
  };

  const selectLinkedContent = (row: NoticePickRow) => {
    const ct = parseCustomerCenterContentType(row.content_type, "notice");
    setAppNoticeId(row.id);
    setType(ct);
    setDeeplinkUrl(buildCustomerCenterBoardDetailPath(ct, row.id));
    // 알림 문구는 운영자가 쓴 값을 지킨다 — 비어 있을 때만 원본 제목을 제목 초안으로 채운다.
    // 본문(게시글 원문)은 알림 메시지로 복사하지 않는다 (Push/Bell 짧은 문구 ≠ 게시판 원문).
    if (!title.trim()) {
      const nextTitle = String(row.title ?? "").trim();
      if (nextTitle) setTitle(nextTitle.slice(0, 200));
    }
    setPickerOpen(false);
    setPickerQ("");
  };

  const clearLinkedContent = () => {
    setAppNoticeId("");
    setLinkedContent(null);
    if (deeplinkUrl.startsWith("/mypage/customer-center")) setDeeplinkUrl("");
  };

  /** 유형을 바꾸면 다른 유형의 원본 연결은 풀린다 (서버도 유형 불일치 원본을 거부). */
  const changeType = (next: CampaignType) => {
    if (next === type) return;
    setType(next);
    if (linkedContent && parseCustomerCenterContentType(linkedContent.content_type, "notice") !== next) {
      clearLinkedContent();
    }
  };

  const applyHeroImage = () => {
    const url =
      typeof linkedContent?.hero_image_url === "string" ? linkedContent.hero_image_url.trim() : "";
    if (!url) return;
    setPushImageUrl(url);
    if (!separateInAppImage) setInAppImageUrl(url);
  };

  /** 공용 이미지 = 푸시·인앱 같은 값, 「인앱 따로」면 인앱만 별도. */
  const effectiveInAppImage = separateInAppImage ? inAppImageUrl : pushImageUrl;

  const presentation = useMemo(
    () =>
      buildAdminCampaignNotificationPresentation({
        title: title.trim() || "DIBAY",
        body: body.trim() || "-",
        type,
        channel,
        deeplink_url: deeplinkUrl || null,
        web_url: webUrl || null,
        push_image_url: pushImageUrl || null,
        in_app_image_url: effectiveInAppImage || null,
        target_type: targetType,
        appNoticeId: appNoticeId || null,
      }),
    [title, body, type, channel, deeplinkUrl, webUrl, pushImageUrl, effectiveInAppImage, targetType, appNoticeId]
  );

  const parseTargetUserIds = () => (targetType === "selected_users" ? parseCampaignUserIds(selectedIds) : undefined);

  const toIsoOrNull = (local: string) => (local ? (adminManilaInputToIso(local) ?? null) : null);

  const buildPayload = (opts: {
    save_as_draft: boolean;
    send_mode: CampaignSendMode;
    create_request_id?: string;
    is_qa?: boolean;
  }) => {
    const scheduledIso = sendMode === "scheduled" ? toIsoOrNull(scheduledAt) : null;
    return {
      title,
      body,
      type,
      channel,
      target_type: targetType,
      deeplink_url: deeplinkUrl || null,
      web_url: webUrl || null,
      push_image_url: pushImageUrl || null,
      in_app_image_url: effectiveInAppImage || null,
      segment_region_code: targetType === "region" ? regionCode : null,
      target_user_ids: parseTargetUserIds(),
      app_notice_id: appNoticeId.trim() || null,
      send_mode: opts.send_mode,
      save_as_draft: opts.save_as_draft,
      is_qa: opts.is_qa === true,
      scheduled_at: scheduledIso,
      create_request_id: opts.create_request_id,
      recurrence_kind: sendMode === "recurring" ? recurrenceKind : undefined,
      recurrence_time: sendMode === "recurring" ? recurrenceTime : null,
      recurrence_timezone: recurrenceTimezone,
      recurrence_start_at:
        sendMode === "recurring" ? (toIsoOrNull(recurrenceStartAt) ?? new Date().toISOString()) : null,
      recurrence_end_at: sendMode === "recurring" ? toIsoOrNull(recurrenceEndAt) : null,
      recurrence_weekday: sendMode === "recurring" && recurrenceKind === "weekly" ? recurrenceWeekday : null,
    };
  };

  const errorFrom = (j: { error?: unknown }) => campaignCreateErrorMessage(j.error, lang);

  const loadAudiencePreview = async () => {
    const res = await fetch("/api/admin/notification-campaigns/audience-preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        channel,
        target_type: targetType,
        segment_region_code: targetType === "region" ? regionCode : null,
        target_user_ids: parseTargetUserIds(),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      audience?: CampaignAudiencePreview;
      error?: string;
    };
    if (!res.ok || !j.ok || !j.audience) {
      setErr(errorFrom(j));
      return null;
    }
    setAudience(j.audience);
    return j.audience;
  };

  // 대상이 바뀌면 이전 인원 조회 결과는 버린다 (확인창에 옛 숫자가 나가지 않게).
  useEffect(() => {
    setAudience(null);
  }, [type, channel, targetType, regionCode, selectedIds]);

  /** occurrence 가 없으면(멱등 재요청 · 초안) 서버가 활성 회차를 찾거나 만든다. */
  const runCampaignSend = async (campaignId: string, occurrenceId: string | null, reason: string | null) => {
    const sendKey = newClientIdempotencyKey();
    const sr = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}/send`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": sendKey,
      },
      body: JSON.stringify({
        ...(occurrenceId ? { occurrence_id: occurrenceId } : {}),
        idempotency_key: sendKey,
        reason,
      }),
    });
    const sj = (await sr.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!sr.ok || !sj?.ok) {
      setErr(errorFrom(sj));
      return false;
    }
    return true;
  };

  const createCampaign = async (opts: {
    save_as_draft: boolean;
    send_mode: CampaignSendMode;
    create_request_id?: string;
    is_qa?: boolean;
  }) => {
    const createRequestId = opts.create_request_id ?? newClientIdempotencyKey();
    const res = await fetch("/api/admin/notification-campaigns", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createRequestId,
      },
      body: JSON.stringify({
        ...buildPayload(opts),
        create_request_id: createRequestId,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      occurrence_id?: string | null;
      error?: string;
    };
    if (!res.ok || !j?.ok || !j.id) {
      setErr(errorFrom(j));
      return null;
    }
    return { id: j.id, occurrenceId: j.occurrence_id ?? null };
  };

  const saveDraft = async () => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await createCampaign({ save_as_draft: true, send_mode: "immediate" });
      if (result) router.push(`/admin/notifications/${result.id}`);
    } finally {
      setBusy(false);
    }
  };

  /** ADM-04: PATCH a stored campaign with the current form (same parser as create). */
  const patchCampaign = async (campaignId: string): Promise<boolean> => {
    const payload: Record<string, unknown> = buildPayload({ save_as_draft: false, send_mode: sendMode });
    delete payload.save_as_draft;
    delete payload.create_request_id;
    delete payload.is_qa;
    const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(errorFrom(j));
      return false;
    }
    return true;
  };

  const confirmTimeLabel = () => {
    if (sendMode === "scheduled") {
      return `${formatCampaignTime(toIsoOrNull(scheduledAt))} ${safeT("admin_campaign_cms_time_scheduled_suffix", { fallbackKo: "예약", fallbackEn: "(scheduled)" })}`;
    }
    if (sendMode === "recurring") {
      const kind =
        recurrenceKind === "daily"
          ? t("admin_notif_recurrence_daily")
          : recurrenceKind === "monthly"
            ? t("admin_notif_recurrence_monthly")
            : t("admin_notif_recurrence_weekly");
      return `${kind} ${recurrenceTime}`;
    }
    return safeT("admin_campaign_cms_time_immediately", { fallbackKo: "즉시 발송", fallbackEn: "Immediately" });
  };

  const confirmFacts = (preview: CampaignAudiencePreview | null): CampaignConfirmFacts => ({
    title: title.trim(),
    targetCount: preview ? preview.totalUsers : null,
    pushEligibleCount: preview ? preview.pushEligibleUsers : null,
    channelLabel: notifChannelLabel(t, channel),
    timeLabel: confirmTimeLabel(),
  });

  const runConfirmed = async (reason: string | null) => {
    if (!confirm || busy) return;
    setErr(null);
    setBusy(true);
    try {
      await confirm.run(reason);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  /** Edit mode: draft → save then send / schedule (each step server-gated by the status machine). */
  const runEditDispatch = async (reason: string | null) => {
    if (!(await patchCampaign(editId))) return;
    if (sendMode === "immediate") {
      if (!(await runCampaignSend(editId, null, reason))) return;
    } else {
      const ar = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(editId)}/actions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule" }),
      });
      const aj = (await ar.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!ar.ok || !aj?.ok) {
        setErr(errorFrom(aj));
        return;
      }
    }
    router.push(`/admin/notifications/${editId}`);
  };

  const confirmImmediateSend = async (reason: string | null) => {
    const result = await createCampaign({
      save_as_draft: false,
      send_mode: "immediate",
      create_request_id: newClientIdempotencyKey(),
    });
    if (!result) return;
    if (!(await runCampaignSend(result.id, result.occurrenceId, reason))) {
      // 캠페인은 만들어졌다 — 같은 버튼으로 다시 만들지 않도록 막고 상세로 안내한다.
      setCreatedUnsentId(result.id);
      return;
    }
    router.push(`/admin/notifications/${result.id}`);
  };

  const missingDraft = campaignCreateMissingForDraft({
    type,
    title,
    body,
    appNoticeId,
    deeplinkUrl,
    webUrl,
    targetType,
    regionCode,
    selectedIds,
    sendMode,
    scheduledAt,
  });
  const missingSend = campaignCreateMissingForSend({
    type,
    title,
    body,
    appNoticeId,
    deeplinkUrl,
    webUrl,
    targetType,
    regionCode,
    selectedIds,
    sendMode,
    scheduledAt,
  });
  const draftReady = missingDraft.length === 0;
  const sendReady = missingSend.length === 0;

  /** 발송 검토 = 대상 인원 조회 → 확인창 1회 (대상 수 · 푸시 가능 수 · 채널 · 시각 · L3 사유). */
  const openReview = async () => {
    setErr(null);
    setInfo(null);
    if (!sendReady) {
      scrollToSection(missingSend[0].section);
      return;
    }
    setBusy(true);
    let preview: CampaignAudiencePreview | null = null;
    try {
      preview = await loadAudiencePreview();
    } finally {
      setBusy(false);
    }
    if (!preview) return;
    setConfirm({
      action: sendMode === "immediate" ? "send" : "schedule",
      facts: confirmFacts(preview),
      run: async (reason) => {
        if (editId) {
          await runEditDispatch(reason);
          return;
        }
        if (sendMode === "immediate") {
          await confirmImmediateSend(reason);
          return;
        }
        const result = await createCampaign({
          save_as_draft: false,
          send_mode: sendMode,
          create_request_id: newClientIdempotencyKey(),
        });
        if (result) router.push(`/admin/notifications/${result.id}`);
      },
    });
  };

  /** Edit mode save: drafts save silently; scheduled/paused re-confirm 대상 · 채널 · 시각. */
  const saveEdit = async () => {
    if (!editId) return;
    setErr(null);
    if (editStatus === "draft") {
      setBusy(true);
      try {
        if (await patchCampaign(editId)) router.push(`/admin/notifications/${editId}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!sendReady) {
      scrollToSection(missingSend[0].section);
      return;
    }
    setBusy(true);
    let preview: CampaignAudiencePreview | null = null;
    try {
      preview = await loadAudiencePreview();
    } finally {
      setBusy(false);
    }
    if (!preview) return;
    setConfirm({
      action: "save_edit",
      facts: confirmFacts(preview),
      run: async () => {
        if (await patchCampaign(editId)) router.push(`/admin/notifications/${editId}`);
      },
    });
  };

  const testIds = parseCampaignUserIds(testUserIds);

  /** 테스트 발송 — 화면에 머문다. 같은 화면의 재테스트는 QA 캠페인 1건을 고쳐 재사용한다. */
  const runTestSend = async () => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      let campaignId = testCampaignIdRef.current;
      if (campaignId && !(await patchCampaign(campaignId))) {
        campaignId = null;
        setErr(null);
      }
      if (!campaignId) {
        const result = await createCampaign({
          save_as_draft: true,
          send_mode: "immediate",
          create_request_id: newClientIdempotencyKey(),
          is_qa: true,
        });
        if (!result) return;
        campaignId = result.id;
        testCampaignIdRef.current = campaignId;
      }
      const testKey = newClientIdempotencyKey();
      const tr = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}/test-send`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": testKey,
        },
        body: JSON.stringify({ user_ids: testIds, idempotency_key: testKey }),
      });
      const tj = (await tr.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        skipped?: number;
        failed?: number;
      };
      if (!tr.ok || !tj?.ok) {
        setErr(errorFrom(tj));
        return;
      }
      setInfo(
        tx(
          `테스트 발송 완료 · 발송 ${tj.sent ?? 0} · 건너뜀 ${tj.skipped ?? 0} · 실패 ${tj.failed ?? 0}`,
          `Test sent · sent ${tj.sent ?? 0} · skipped ${tj.skipped ?? 0} · failed ${tj.failed ?? 0}`
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (kind: "push" | "in_app", file: File | null) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadCampaignImage(kind, file);
      if (!url) {
        setErr(campaignCreateErrorMessage("upload_failed", lang));
        return;
      }
      if (kind === "push") {
        setPushImageUrl(url);
        if (!separateInAppImage) setInAppImageUrl(url);
      } else {
        setInAppImageUrl(url);
      }
    } finally {
      setBusy(false);
    }
  };

  const reviewPrimaryLabel =
    sendMode === "scheduled"
      ? t("admin_notif_btn_confirm_schedule")
      : sendMode === "recurring"
        ? t("admin_notif_btn_start_recurring")
        : targetType === "all"
          ? t("admin_notif_btn_send_all_members")
          : t("admin_notif_btn_send_now");

  const linkedId = appNoticeId.trim();
  const linkedType: CustomerCenterContentType | null = linkedContent
    ? parseCustomerCenterContentType(linkedContent.content_type, type)
    : linkedId
      ? type
      : null;
  const boardLabel = linkedType != null ? BOARD_LABEL[linkedType][lang] : "";
  const createdLabel = linkedContent?.created_at
    ? formatCampaignTime(String(linkedContent.created_at))
    : "—";
  const statusLabel =
    linkedContent?.is_active !== false
      ? safeT("admin_app_status_visible", { fallbackKo: "게시", fallbackEn: "Published" })
      : safeT("admin_app_status_hidden", { fallbackKo: "숨김", fallbackEn: "Hidden" });

  const pickerFiltered = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    const pickable = pickerRows.filter((r) => isCampaignSourcePickable(r, type));
    if (!q) return pickable;
    return pickable.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        String(r.title ?? "")
          .toLowerCase()
          .includes(q)
    );
  }, [pickerQ, pickerRows, type]);
  const pickerHiddenCount = pickerRows.filter(
    (r) => String(r.content_type ?? "notice") === type && !isCampaignSourcePickable(r, type)
  ).length;

  const typeLabel = (v: CampaignType) =>
    v === "notice" ? t("admin_notif_type_notice") : v === "system" ? t("admin_notif_type_system") : t("admin_notif_type_marketing");
  const targetOptions: { value: string; ko: string; en: string }[] = [
    { value: "all", ko: "전체 회원", en: "All members" },
    { value: "marketing_opt_in", ko: "마케팅 수신 동의 회원", en: "Marketing opt-in members" },
    { value: "active_users", ko: "최근 30일 활동 회원", en: "Active in last 30 days" },
    { value: "region", ko: "지역", en: "Region" },
    { value: "selected_users", ko: "회원 직접 지정", en: "Specific members" },
  ];
  const targetLabel = targetOptions.find((o) => o.value === targetType);
  const weekdays = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timezoneLabel = recurrenceTimezone === "Asia/Manila" ? "PHT" : recurrenceTimezone;
  const createLocked = Boolean(createdUnsentId);
  const myUserId = adminMe?.userId ?? "";

  const missingList = (items: CampaignCreateMissingItem[]) => (
    <ul className="space-y-1" data-admin-notif-missing={items.length}>
      {items.map((m) => (
        <li key={m.id}>
          <AdminListItemButton className="!py-1.5 text-sm text-sam-danger" onClick={() => scrollToSection(m.section)}>
            · {lang === "ko" ? m.ko : m.en}
          </AdminListItemButton>
        </li>
      ))}
    </ul>
  );

  const summaryRow = (label: string, value: string) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 text-sam-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-sam-fg">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← {t("admin_back_to_list")}
      </Link>
      <AdminPageHeader
        title={
          editId
            ? `${safeT("admin_campaign_cms_edit_title", { fallbackKo: "알림 수정", fallbackEn: "Edit notification" })}${editStatus ? ` · ${campaignStatusLabel(editStatus, lang)}` : ""}`
            : t("admin_notif_page_create")
        }
      />
      {editId && editLoading ? <AdminLoadingState ko={lang === "ko"} label={t("common_loading")} /> : null}
      {editId && !editLoading && editLoadErr ? (
        <AdminErrorState
          ko={lang === "ko"}
          code={editLoadErr.code}
          httpStatus={editLoadErr.httpStatus}
          onRetry={() => {
            setEditLoadErr(null);
            setEditBlocked(null);
            setEditReloadKey((k) => k + 1);
          }}
        />
      ) : null}
      {editBlocked && !editLoadErr ? (
        <p className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg">
          {editBlocked}
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* ① 무엇을 알릴까 — 유형 + 원본 */}
          <section id="campaign-source" className={sectionClass}>
            <h2 className="text-sm font-semibold text-sam-fg">{tx("① 무엇을 알릴까요", "① What to announce")}</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("admin_notif_label_type")}>
              {(["notice", "system", "marketing"] as const).map((v) => (
                <AdminChipButton key={v} selected={type === v} onClick={() => changeType(v)}>
                  {typeLabel(v)}
                </AdminChipButton>
              ))}
            </div>

            {linkedLoading ? (
              <p className="text-sm text-sam-muted">{t("common_loading")}</p>
            ) : linkedId ? (
              <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3">
                <div className="flex flex-wrap items-start gap-3">
                  {linkedContent?.hero_image_url ? (
                    <SamarketThumbnail
                      src={String(linkedContent.hero_image_url)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-ui-rect object-cover"
                      size={56}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="inline-block rounded-ui-rect bg-sam-surface px-1.5 py-0.5 text-xs font-medium text-sam-muted">
                      {tx("연결된 원본", "Linked original")} · {boardLabel}
                    </span>
                    <p className="break-words text-sm font-semibold text-sam-fg">
                      {linkedContent?.title ?? linkedId}
                    </p>
                    <p className="text-xs text-sam-muted">
                      {linkedContent ? `${statusLabel} · ${createdLabel}` : tx("원본 정보를 불러오지 못했습니다", "Could not load the original")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminActionLink
                    href={`/admin/app/notices/${encodeURIComponent(linkedId)}`}
                    size="sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {safeT("admin_notif_btn_view_original", { fallbackKo: "원본 보기", fallbackEn: "View original" })}
                  </AdminActionLink>
                  <AdminActionButton variant="secondary" size="sm" disabled={createLocked} onClick={() => void openPicker()}>
                    {safeT("admin_notif_btn_change_original", { fallbackKo: "원본 변경", fallbackEn: "Change original" })}
                  </AdminActionButton>
                  <AdminActionButton variant="ghost" size="sm" disabled={createLocked} onClick={clearLinkedContent}>
                    {safeT("admin_notif_btn_unlink_original", { fallbackKo: "연결 해제", fallbackEn: "Unlink" })}
                  </AdminActionButton>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-ui-rect border border-dashed border-sam-border p-3">
                <p className="text-sm text-sam-fg">
                  {type === "marketing"
                    ? tx(
                        "마케팅은 고객센터 원본을 연결하거나, 아래에 앱 내부 랜딩 경로를 입력하세요.",
                        "Link a Customer Center original, or enter an in-app landing path below."
                      )
                    : tx(
                        `${typeLabel(type)} 알림은 고객센터에 게시된 ${typeLabel(type)} 글을 연결해야 보낼 수 있습니다. 회원이 알림을 누르면 그 글이 열립니다.`,
                        `${typeLabel(type)} notifications must link a published Customer Center post. Tapping the notification opens it.`
                      )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <AdminActionButton variant="secondary" onClick={() => void openPicker()}>
                    {tx("게시글 선택", "Select post")}
                  </AdminActionButton>
                  <AdminActionLink href="/admin/app/notices/create" target="_blank" rel="noreferrer">
                    {tx("고객센터 새 글 작성 (새 창)", "Write a new post (new tab)")}
                  </AdminActionLink>
                </div>
                {type === "marketing" ? (
                  <label className="block text-sm">
                    <span className="text-sam-muted">{tx("랜딩 경로 (앱 내부)", "Landing path (in-app)")}</span>
                    <input
                      value={deeplinkUrl}
                      onChange={(e) => setDeeplinkUrl(e.target.value)}
                      placeholder="/market"
                      className={fieldClass}
                    />
                  </label>
                ) : null}
              </div>
            )}
          </section>

          {/* ② 문구 · 이미지 */}
          <section id="campaign-copy" className={sectionClass}>
            <div>
              <h2 className="text-sm font-semibold text-sam-fg">{tx("② 알림 문구", "② Message")}</h2>
              <p className="mt-1 text-xs text-sam-muted">
                {tx(
                  "푸시·알림함에 보이는 짧은 문구입니다. 게시글 본문은 원본에서 열립니다.",
                  "Short copy shown in push and the inbox. The full post opens from the original."
                )}
              </p>
            </div>
            <label className="block text-sm">
              <span className="text-sam-muted">{tx("제목", "Title")}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
              <span className={`mt-1 block text-right text-xs ${title.length > TITLE_GUIDE_MAX ? "text-sam-warning" : "text-sam-meta"}`}>
                {title.length}/{TITLE_GUIDE_MAX}
              </span>
            </label>
            <label className="block text-sm">
              <span className="text-sam-muted">{tx("메시지", "Message")}</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={fieldClass} />
              <span className={`mt-1 block text-right text-xs ${body.length > BODY_GUIDE_MAX ? "text-sam-warning" : "text-sam-meta"}`}>
                {body.length}/{BODY_GUIDE_MAX}
              </span>
            </label>

            <div className="space-y-2 text-sm">
              <span className="text-sam-muted">{tx("이미지 (선택)", "Image (optional)")}</span>
              <div className="flex flex-wrap items-center gap-3">
                {pushImageUrl ? (
                  <SamarketThumbnail src={pushImageUrl} alt="" className="h-16 w-16 rounded-ui-rect object-cover" size={64} />
                ) : null}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block text-xs"
                  onChange={(e) => void onUpload("push", e.target.files?.[0] ?? null)}
                />
                {linkedContent?.hero_image_url ? (
                  <AdminActionButton variant="secondary" size="sm" onClick={applyHeroImage}>
                    {safeT("admin_notif_btn_use_hero_image", { fallbackKo: "원본 대표 이미지 사용", fallbackEn: "Use original hero image" })}
                  </AdminActionButton>
                ) : null}
                {pushImageUrl ? (
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPushImageUrl("");
                      if (!separateInAppImage) setInAppImageUrl("");
                    }}
                  >
                    {tx("이미지 빼기", "Remove image")}
                  </AdminActionButton>
                ) : null}
              </div>
              <p className="text-xs text-sam-meta">
                {tx(
                  "한 장을 푸시·알림함에 함께 씁니다. iOS 푸시는 이미지를 표시하지 않습니다.",
                  "One image is used for push and inbox. iOS push does not show images."
                )}
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={separateInAppImage}
                  onChange={(e) => {
                    setSeparateInAppImage(e.target.checked);
                    if (!e.target.checked) setInAppImageUrl(pushImageUrl);
                  }}
                />
                <span>{tx("알림함 이미지를 따로 지정", "Use a different inbox image")}</span>
              </label>
              {separateInAppImage ? (
                <div className="flex flex-wrap items-center gap-3 pl-6">
                  {inAppImageUrl ? (
                    <SamarketThumbnail src={inAppImageUrl} alt="" className="h-12 w-12 rounded-ui-rect object-cover" size={48} />
                  ) : null}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block text-xs"
                    onChange={(e) => void onUpload("in_app", e.target.files?.[0] ?? null)}
                  />
                </div>
              ) : null}
            </div>
          </section>

          {/* ③ 누구에게 · 언제 */}
          <section id="campaign-audience" className={sectionClass}>
            <h2 className="text-sm font-semibold text-sam-fg">{tx("③ 누구에게 · 언제", "③ Who and when")}</h2>

            <label className="block text-sm">
              <span className="text-sam-muted">{t("admin_notif_label_target")}</span>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className={fieldClass}>
                {targetOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {lang === "ko" ? o.ko : o.en}
                  </option>
                ))}
              </select>
            </label>

            {targetType === "region" ? (
              <label className="block text-sm">
                <span className="text-sam-muted">{t("admin_notif_label_region_code")}</span>
                <input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} className={fieldClass} />
              </label>
            ) : null}

            {targetType === "selected_users" ? (
              <label className="block text-sm">
                <span className="text-sam-muted">
                  {tx("회원 ID (줄바꿈·쉼표로 구분)", "Member IDs (newline or comma)")} ·{" "}
                  {parseCampaignUserIds(selectedIds).length}
                </span>
                <textarea
                  value={selectedIds}
                  onChange={(e) => setSelectedIds(e.target.value)}
                  rows={3}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </label>
            ) : null}

            <div className="space-y-2 text-sm">
              <span className="text-sam-muted">{t("admin_notif_label_channel")}</span>
              <div className="flex flex-wrap gap-2">
                {(["push_and_in_app", "push_only", "in_app_only"] as const).map((c) => (
                  <AdminChipButton key={c} selected={channel === c} onClick={() => setChannel(c)}>
                    {t(`admin_notif_channel_${c}`)}
                  </AdminChipButton>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <span className="text-sam-muted">{t("admin_notif_label_send_mode")}</span>
              <div className="flex flex-wrap gap-2">
                {(["immediate", "scheduled", "recurring"] as const).map((mode) => (
                  <AdminChipButton
                    key={mode}
                    selected={sendMode === mode}
                    disabled={!sendModeAllowed(mode)}
                    onClick={() => setSendMode(mode)}
                  >
                    {mode === "immediate"
                      ? t("admin_notif_send_mode_immediate")
                      : mode === "scheduled"
                        ? t("admin_notif_send_mode_scheduled")
                        : t("admin_notif_send_mode_recurring")}
                  </AdminChipButton>
                ))}
              </div>
            </div>

            {sendMode === "scheduled" ? (
              <label className="block text-sm">
                <span className="text-sam-muted">{tx("예약 시각 (PHT)", "Scheduled time (PHT)")}</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={fieldClass}
                />
              </label>
            ) : null}

            {sendMode === "recurring" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(["daily", "weekly", "monthly"] as const).map((k) => (
                    <AdminChipButton key={k} selected={recurrenceKind === k} onClick={() => setRecurrenceKind(k)}>
                      {t(`admin_notif_recurrence_${k}`)}
                    </AdminChipButton>
                  ))}
                </div>
                {recurrenceKind === "weekly" ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t("admin_notif_label_recurrence_weekday")}>
                    {weekdays.map((d, i) => (
                      <AdminChipButton key={d} selected={recurrenceWeekday === i} onClick={() => setRecurrenceWeekday(i)}>
                        {d}
                      </AdminChipButton>
                    ))}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    <span className="text-sam-muted">
                      {tx("발송 시각", "Send time")} ({timezoneLabel})
                    </span>
                    <input
                      type="time"
                      value={recurrenceTime}
                      onChange={(e) => setRecurrenceTime(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-sam-muted">{tx("시작 (비우면 지금)", "Starts (empty = now)")}</span>
                    <input
                      type="datetime-local"
                      value={recurrenceStartAt}
                      onChange={(e) => setRecurrenceStartAt(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-sam-muted">{tx("종료 (비우면 계속)", "Ends (empty = no end)")}</span>
                    <input
                      type="datetime-local"
                      value={recurrenceEndAt}
                      onChange={(e) => setRecurrenceEndAt(e.target.value)}
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <details className="rounded-ui-rect border border-sam-border-soft p-3 text-sm">
              <summary className="cursor-pointer text-sam-muted">{tx("고급 설정 — 이동 경로", "Advanced — destination")}</summary>
              <div className="mt-3 space-y-3">
                {linkedId ? (
                  <p className="text-xs text-sam-muted">
                    {tx("알림을 누르면 이동", "Opens on tap")}: <span className="font-mono text-sam-fg">{presentation.deepLink}</span>
                    <br />
                    {tx("원본을 연결하면 이동 경로는 원본 글로 고정됩니다.", "With a linked original, the destination is the post.")}
                  </p>
                ) : (
                  <label className="block">
                    <span className="text-sam-muted">{t("admin_notif_label_deeplink_url")}</span>
                    <input value={deeplinkUrl} onChange={(e) => setDeeplinkUrl(e.target.value)} className={fieldClass} />
                  </label>
                )}
                <label className="block">
                  <span className="text-sam-muted">{t("admin_notif_label_web_url")}</span>
                  <input value={webUrl} onChange={(e) => setWebUrl(e.target.value)} className={fieldClass} />
                </label>
              </div>
            </details>
          </section>
        </div>

        {/* 오른쪽 고정 패널 — 미리보기 · 요약 · 남은 필수 항목 · 버튼 */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["android", "Android"],
                  ["ios", "iOS"],
                  ["in_app", tx("알림함", "Inbox")],
                ] as const
              ).map(([id, label]) => (
                <AdminChipButton key={id} selected={previewTab === id} onClick={() => setPreviewTab(id)}>
                  {label}
                </AdminChipButton>
              ))}
            </div>
            <div className="flex gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3" data-admin-notif-preview={previewTab}>
              {previewTab === "in_app" && presentation.inAppPresentation.imageUrl ? (
                <SamarketThumbnail
                  src={presentation.inAppPresentation.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-ui-rect object-cover"
                  size={40}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                {previewTab === "android" && presentation.pushImageUrl ? (
                  <SamarketThumbnail
                    src={presentation.pushImageUrl}
                    alt=""
                    className="mb-2 h-20 w-full rounded-ui-rect object-cover"
                    size={80}
                  />
                ) : null}
                <p className="truncate text-sm font-medium text-sam-fg">
                  {previewTab === "in_app" ? presentation.inAppPresentation.title : presentation.pushPayload.title}
                </p>
                <p className="line-clamp-2 text-xs text-sam-muted">
                  {previewTab === "in_app" ? presentation.inAppPresentation.body : presentation.pushPayload.body}
                </p>
              </div>
            </div>
            {previewTab === "ios" ? (
              <p className="text-xs text-sam-meta">{tx("iOS 푸시는 이미지 없이 글자만 보입니다.", "iOS push shows text only.")}</p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            {summaryRow(tx("유형", "Type"), typeLabel(type))}
            {summaryRow(tx("원본", "Original"), linkedContent?.title ?? (linkedId ? linkedId : "—"))}
            {summaryRow(t("admin_notif_label_target"), targetLabel ? (lang === "ko" ? targetLabel.ko : targetLabel.en) : targetType)}
            {summaryRow(t("admin_notif_label_channel"), notifChannelLabel(t, channel))}
            {summaryRow(t("admin_notif_label_send_mode"), confirmTimeLabel())}
            {audience ? (
              <p className="text-xs text-sam-muted" data-admin-notif-audience="1">
                {tx(
                  `대상 ${audience.totalUsers}명 · 푸시 가능 ${audience.pushEligibleUsers}명 · 제외 ${audience.excludedOptOut + audience.excludedNoDevice + audience.excludedInvalidTarget}명`,
                  `${audience.totalUsers} members · ${audience.pushEligibleUsers} push-eligible · ${audience.excludedOptOut + audience.excludedNoDevice + audience.excludedInvalidTarget} excluded`
                )}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            {sendReady ? (
              <p className="text-sm text-sam-fg">{tx("발송 준비가 끝났습니다.", "Ready to send.")}</p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-sam-fg">{tx("남은 필수 항목", "Still required")}</p>
                {missingList(missingSend)}
              </div>
            )}

            {err ? (
              <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">
                {err}
              </p>
            ) : null}
            {info ? (
              <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg" role="status">
                {info}
              </p>
            ) : null}
            {createdUnsentId ? (
              <AdminActionLink href={`/admin/notifications/${encodeURIComponent(createdUnsentId)}`} className="w-full">
                {tx("만든 알림 상세에서 발송 상태 보기", "Open the created notification")}
              </AdminActionLink>
            ) : null}

            {editId ? (
              <div className="flex flex-col gap-2">
                {editStatus === "draft" ? (
                  <AdminActionButton
                    variant="primary"
                    className="w-full"
                    disabled={busy || Boolean(editBlocked) || !sendAction.allowed || !sendReady}
                    title={sendAction.reason ?? undefined}
                    onClick={() => void openReview()}
                  >
                    {reviewPrimaryLabel}
                  </AdminActionButton>
                ) : null}
                <AdminActionButton
                  variant={editStatus === "draft" ? "secondary" : "primary"}
                  className="w-full"
                  disabled={
                    busy || !draftReady || Boolean(editBlocked) || (editStatus !== "draft" && !sendAction.allowed)
                  }
                  title={editStatus !== "draft" ? (sendAction.reason ?? undefined) : undefined}
                  onClick={() => void saveEdit()}
                  data-admin-notif-save-edit="1"
                >
                  {safeT("admin_campaign_cms_btn_save_changes", { fallbackKo: "변경 저장", fallbackEn: "Save changes" })}
                </AdminActionButton>
                <AdminActionLink href={`/admin/notifications/${encodeURIComponent(editId)}`} className="w-full">
                  {t("admin_notif_btn_cancel")}
                </AdminActionLink>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AdminActionButton
                  variant="primary"
                  className="w-full"
                  disabled={busy || createLocked || !sendAction.allowed || !sendReady}
                  title={sendAction.reason ?? undefined}
                  onClick={() => void openReview()}
                  data-admin-notif-review="1"
                >
                  {reviewPrimaryLabel}
                </AdminActionButton>
                <AdminActionButton
                  variant="secondary"
                  className="w-full"
                  disabled={busy || createLocked || !draftReady}
                  onClick={() => void saveDraft()}
                >
                  {t("admin_notif_btn_draft")}
                </AdminActionButton>
              </div>
            )}
            {!sendAction.allowed && sendAction.reason ? (
              <p className="text-xs text-sam-muted" data-admin-action-denied="1">
                {lang === "ko" ? `발송 비활성: ${sendAction.reason}` : `Send disabled: ${sendAction.reason}`}
              </p>
            ) : null}
          </div>

          {!editId ? (
            <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <p className="text-sm font-medium text-sam-fg">{t("admin_notif_btn_test_send")}</p>
              <p className="text-xs text-sam-muted">
                {tx(
                  "지정한 회원에게만 먼저 보내 봅니다. 실제 대상에게는 나가지 않습니다.",
                  "Sends only to the members below. Real recipients are not notified."
                )}
              </p>
              <textarea
                value={testUserIds}
                onChange={(e) => setTestUserIds(e.target.value)}
                rows={2}
                placeholder={tx("회원 ID (최대 20명)", "Member IDs (up to 20)")}
                className={`${fieldClass} font-mono text-xs`}
              />
              <div className="flex flex-wrap gap-2">
                {myUserId ? (
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!testIds.includes(myUserId)) {
                        setTestUserIds((v) => (v.trim() ? `${v.trim()}\n${myUserId}` : myUserId));
                      }
                    }}
                  >
                    {tx("내 계정 추가", "Add my account")}
                  </AdminActionButton>
                ) : null}
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  disabled={busy || !draftReady || testIds.length === 0}
                  onClick={() => void runTestSend()}
                >
                  {t("admin_notif_btn_test_send")}
                </AdminActionButton>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <CampaignActionConfirmDialog
        action={confirm?.action ?? null}
        facts={confirm?.facts ?? null}
        lang={lang}
        pending={busy}
        cancelLabel={t("admin_notif_btn_cancel")}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason) => void runConfirmed(reason)}
      />

      {pickerOpen ? (
        <DibayOverlayRoot
          open
          onClose={() => setPickerOpen(false)}
          dismissible
          placement="center"
          zRole="dialog"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[80vh] overflow-hidden !p-0`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-4 py-3">
              <h3 className={OverlayUi.title}>
                {tx(`게시 중인 ${typeLabel(type)} 글 선택`, `Select a published ${typeLabel(type)} post`)}
              </h3>
              <DibayOverlayButton roleTone="text" className="!min-h-9 !flex-none !px-2" onClick={() => setPickerOpen(false)}>
                {t("admin_notif_btn_cancel")}
              </DibayOverlayButton>
            </div>
            <div className="space-y-2 p-4">
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder={safeT("admin_notif_picker_search_ph", {
                  fallbackKo: "제목 또는 ID 검색",
                  fallbackEn: "Search title or ID",
                })}
                className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-2 text-sm"
              />
              {pickerLoading ? (
                <p className="text-xs text-sam-muted">{t("common_loading")}</p>
              ) : (
                <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                  {pickerFiltered.map((row) => (
                    <li key={row.id}>
                      <AdminListItemButton className="border border-sam-border-soft" onClick={() => selectLinkedContent(row)}>
                        <span className="text-sm font-medium text-sam-fg">{row.title}</span>
                        <span className="mt-0.5 block text-xs text-sam-meta">
                          {row.created_at ? formatCampaignTime(String(row.created_at)) : "—"}
                        </span>
                      </AdminListItemButton>
                    </li>
                  ))}
                  {pickerFiltered.length === 0 ? (
                    <li className="space-y-2 py-6 text-center text-xs text-sam-muted">
                      <p>
                        {tx(
                          `게시 중인 ${typeLabel(type)} 글이 없습니다. 고객센터에서 먼저 글을 게시하세요.`,
                          `No published ${typeLabel(type)} posts. Publish one in the Customer Center first.`
                        )}
                      </p>
                      <AdminActionLink href="/admin/app/notices/create" size="sm" target="_blank" rel="noreferrer">
                        {tx("고객센터 새 글 작성 (새 창)", "Write a new post (new tab)")}
                      </AdminActionLink>
                    </li>
                  ) : null}
                </ul>
              )}
              {pickerHiddenCount > 0 ? (
                <p className="text-xs text-sam-meta">
                  {tx(
                    `숨김·기간 외 글 ${pickerHiddenCount}건은 발송할 수 없어 목록에서 뺐습니다.`,
                    `${pickerHiddenCount} hidden or out-of-period posts are excluded.`
                  )}
                </p>
              ) : null}
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </div>
  );
}
