"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import type { CampaignSendMode } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { parseCustomerCenterContentType } from "@/lib/notices/customer-center-content";
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
  type CampaignCreateFormState,
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
type SourceMode = "auto" | "existing";
type SourceRef = { appNoticeId: string | null; deeplink: string | null };

type LinkedContent = {
  id: string;
  content_type: string;
  title: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

type NoticePickRow = {
  id: string;
  title: string;
  content_type?: string | null;
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at?: string | null;
};

/** 이 화면이 알림과 함께 만든 고객센터 글 — 같은 화면의 재시도·테스트·발송은 이 글 1건을 고쳐 쓴다. */
type AutoNotice = { id: string; type: CampaignType; title: string; body: string; active: boolean };

/** 반복 발송 기본 시간대 = 운영 기준 PHT. 기존 캠페인은 저장된 시간대를 그대로 유지한다. */
const DEFAULT_RECURRENCE_TIMEZONE = "Asia/Manila";
const TITLE_GUIDE_MAX = 50;
const BODY_GUIDE_MAX = 120;

async function uploadCampaignImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("kind", "push");
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

const fieldClass = "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-2 text-sm";

/**
 * 관리자 알림 보내기 — 한 화면 (2026-10-30 Owner 「프로세스 줄이기」).
 * 기본 흐름: 유형 → 제목·메시지 → [발송]. 공지·시스템·마케팅 원본 규칙(서버 SSOT)은 그대로이며,
 * 「자동 게시」가 알림 문구로 고객센터 글을 함께 만든다 (별도 글 작성 단계 없음).
 */
export function AdminNotificationCampaignCreatePage() {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminMe } = useAdminShell();
  const lang = language === "en" ? "en" : "ko";
  const tx = (ko: string, en: string) => (lang === "ko" ? ko : en);

  const [type, setType] = useState<CampaignType>("notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("auto");
  /** 자동 게시 글 본문 — 비우면 알림 메시지를 그대로 쓴다. */
  const [detail, setDetail] = useState("");
  const [appNoticeId, setAppNoticeId] = useState("");
  const [linkedContent, setLinkedContent] = useState<LinkedContent | null>(null);
  const [channel, setChannel] = useState<Channel>("push_and_in_app");
  const [targetType, setTargetType] = useState<string>("all");
  const [deeplinkUrl, setDeeplinkUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  /** 수정 모드에서 푸시·알림함 이미지가 달랐으면 알림함 이미지를 보존한다. */
  const [inAppImageOverride, setInAppImageOverride] = useState<string | null>(null);
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [extraTestIds, setExtraTestIds] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerRows, setPickerRows] = useState<NoticePickRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** 생성은 됐지만 발송 요청이 실패한 캠페인 — 중복 생성을 막고 상세로 안내한다. */
  const [createdUnsentId, setCreatedUnsentId] = useState<string | null>(null);
  // ADM-04: the create form doubles as the edit form (`?edit=<campaignId>`).
  const editId = searchParams.get("edit")?.trim() ?? "";
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editBlocked, setEditBlocked] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(Boolean(searchParams.get("edit")?.trim()));
  const [editLoadErr, setEditLoadErr] = useState<AdminLoadFailure | null>(null);
  const [editReloadKey, setEditReloadKey] = useState(0);
  const [confirm, setConfirm] = useState<{
    action: CampaignConfirmAction;
    facts: CampaignConfirmFacts;
    /** L3(발송) 확인창 사유 — 발송 API 로 보내 감사에 남긴다. L1 동작은 null. */
    run: (reason: string | null) => Promise<void>;
  } | null>(null);
  // IA-01: 실제 수신자 발송·예약 = `manage` 키. 초안 저장·본인 테스트 발송은 그대로. 서버 가드가 최종 판정.
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
  const autoNoticeRef = useRef<AutoNotice | null>(null);
  /** 테스트 발송용 QA 캠페인 — 같은 화면의 재테스트는 새로 만들지 않고 고쳐서 재사용한다. */
  const testCampaignIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (searchParams.get("edit")) return;
    const qType = searchParams.get("type");
    if (qType === "notice" || qType === "marketing" || qType === "system") setType(qType);
    const qTitle = searchParams.get("title");
    if (qTitle) setTitle(qTitle);
    const qBody = searchParams.get("body");
    if (qBody) setBody(qBody);
    const qDeeplink = searchParams.get("deeplink");
    if (qDeeplink) {
      setDeeplinkUrl(qDeeplink);
      setSourceMode("existing");
    }
    const qNotice = searchParams.get("appNoticeId");
    if (qNotice) {
      setAppNoticeId(qNotice);
      setSourceMode("existing");
    }
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
        setImageUrl(pushImg || inAppImg);
        setInAppImageOverride(inAppImg && inAppImg !== pushImg ? inAppImg : null);
        setRegionCode(str(c.segment_region_code));
        setSelectedIds(readSelectedUserIdsFromPayload(c.target_payload).join("\n"));
        setAppNoticeId(readCampaignContentId(c.target_payload));
        setSourceMode("existing");
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
    const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(trimmed)}`, { credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notice?: LinkedContent };
    if (res.ok && j.ok && j.notice) {
      setLinkedContent(j.notice);
      setType(parseCustomerCenterContentType(j.notice.content_type, "notice"));
    } else {
      setLinkedContent(null);
    }
  }, []);

  useEffect(() => {
    if (sourceMode === "existing") void loadLinkedContent(appNoticeId);
  }, [appNoticeId, sourceMode, loadLinkedContent]);

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await fetch("/api/admin/app-notices", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notices?: NoticePickRow[] };
      setPickerRows(res.ok && j.ok && Array.isArray(j.notices) ? j.notices : []);
    } finally {
      setPickerLoading(false);
    }
  };

  const selectLinkedContent = (row: NoticePickRow) => {
    setSourceMode("existing");
    setAppNoticeId(row.id);
    setType(parseCustomerCenterContentType(row.content_type, "notice"));
    // 알림 문구는 운영자가 쓴 값을 지킨다 — 비어 있을 때만 원본 제목을 제목 초안으로.
    if (!title.trim()) setTitle(String(row.title ?? "").trim().slice(0, 200));
    setPickerOpen(false);
    setPickerQ("");
  };

  /** 「새 글로 자동 게시」로 되돌린다. */
  const switchToAutoSource = () => {
    setSourceMode("auto");
    setAppNoticeId("");
    setLinkedContent(null);
    if (deeplinkUrl.startsWith("/mypage/customer-center")) setDeeplinkUrl("");
  };

  const changeType = (next: CampaignType) => {
    if (next === type) return;
    setType(next);
    if (sourceMode === "existing" && linkedContent) switchToAutoSource();
  };

  const linkedId = sourceMode === "existing" ? appNoticeId.trim() : "";
  const sourceDeeplink = linkedId ? buildCustomerCenterBoardDetailPath(type, linkedId) : deeplinkUrl;
  const pushImage = imageUrl;
  const inAppImage = inAppImageOverride ?? imageUrl;

  const presentation = useMemo(
    () =>
      buildAdminCampaignNotificationPresentation({
        title: title.trim() || "DIBAY",
        body: body.trim() || "-",
        type,
        channel,
        deeplink_url: sourceDeeplink || null,
        web_url: webUrl || null,
        push_image_url: pushImage || null,
        in_app_image_url: inAppImage || null,
        target_type: targetType,
        appNoticeId: linkedId || null,
      }),
    [title, body, type, channel, sourceDeeplink, webUrl, pushImage, inAppImage, targetType, linkedId]
  );

  const formState: CampaignCreateFormState = {
    type,
    sourceMode,
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
  };
  const missingDraft = campaignCreateMissingForDraft(formState);
  const missingSend = campaignCreateMissingForSend(formState);
  const draftReady = missingDraft.length === 0;
  const sendReady = missingSend.length === 0;

  const errorFrom = (j: { error?: unknown }) => campaignCreateErrorMessage(j.error, lang);
  const toIsoOrNull = (local: string) => (local ? (adminManilaInputToIso(local) ?? null) : null);
  const parseTargetUserIds = () => (targetType === "selected_users" ? parseCampaignUserIds(selectedIds) : undefined);

  /**
   * 원본 확보 — 자동 게시면 이 화면의 글 1건을 만들거나 고친다.
   * `publish`: 실발송(true) = 게시 · 테스트·임시 저장(false) = 숨김 유지. 예약은 게시 시작 = 예약 시각.
   * 기존 글 연결인데 숨김이면 발송할 때 게시한다 (숨긴 글로 알림을 보내면 회원이 열 수 없다).
   */
  const ensureSource = async (publish: boolean): Promise<SourceRef | null> => {
    if (sourceMode === "existing") {
      if (linkedId && publish && linkedContent?.is_active === false) {
        const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(linkedId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: true }),
        });
        if (!res.ok) {
          setErr(campaignCreateErrorMessage("content_source_unavailable", lang));
          return null;
        }
      }
      return { appNoticeId: linkedId || null, deeplink: sourceDeeplink || null };
    }
    const content = { title: title.trim(), body: (detail.trim() || body.trim()).slice(0, 20000), type };
    const startsAt = publish && sendMode === "scheduled" ? toIsoOrNull(scheduledAt) : null;
    const prev = autoNoticeRef.current;
    if (prev) {
      const patch: Record<string, unknown> = {};
      if (prev.title !== content.title) patch.title = content.title;
      if (prev.body !== content.body) patch.body = content.body;
      if (prev.type !== content.type) patch.content_type = content.type;
      if (publish !== prev.active) patch.is_active = publish;
      if (publish) patch.starts_at = startsAt;
      if (Object.keys(patch).length > 0) {
        const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(prev.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          setErr(tx("고객센터 글을 저장하지 못했습니다.", "Could not save the Customer Center post."));
          return null;
        }
        autoNoticeRef.current = { ...prev, ...content, active: publish };
      }
      return { appNoticeId: prev.id, deeplink: buildCustomerCenterBoardDetailPath(content.type, prev.id) };
    }
    const res = await fetch("/api/admin/app-notices", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: content.title,
        body: content.body,
        content_type: content.type,
        hero_image_url: imageUrl || null,
        is_active: publish,
        starts_at: startsAt,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notice?: { id?: string } };
    const id = j.notice?.id ? String(j.notice.id) : "";
    if (!res.ok || !j.ok || !id) {
      setErr(tx("고객센터 글을 만들지 못했습니다.", "Could not create the Customer Center post."));
      return null;
    }
    autoNoticeRef.current = { id, ...content, active: publish };
    return { appNoticeId: id, deeplink: buildCustomerCenterBoardDetailPath(content.type, id) };
  };

  const buildPayload = (
    source: SourceRef,
    opts: { save_as_draft: boolean; send_mode: CampaignSendMode; create_request_id?: string; is_qa?: boolean }
  ) => ({
    title,
    body,
    type,
    channel,
    target_type: targetType,
    deeplink_url: source.deeplink,
    web_url: webUrl || null,
    push_image_url: pushImage || null,
    in_app_image_url: inAppImage || null,
    segment_region_code: targetType === "region" ? regionCode : null,
    target_user_ids: parseTargetUserIds(),
    app_notice_id: source.appNoticeId,
    send_mode: opts.send_mode,
    save_as_draft: opts.save_as_draft,
    is_qa: opts.is_qa === true,
    scheduled_at: sendMode === "scheduled" ? toIsoOrNull(scheduledAt) : null,
    create_request_id: opts.create_request_id,
    recurrence_kind: sendMode === "recurring" ? recurrenceKind : undefined,
    recurrence_time: sendMode === "recurring" ? recurrenceTime : null,
    recurrence_timezone: recurrenceTimezone,
    recurrence_start_at:
      sendMode === "recurring" ? (toIsoOrNull(recurrenceStartAt) ?? new Date().toISOString()) : null,
    recurrence_end_at: sendMode === "recurring" ? toIsoOrNull(recurrenceEndAt) : null,
    recurrence_weekday: sendMode === "recurring" && recurrenceKind === "weekly" ? recurrenceWeekday : null,
  });

  const createCampaign = async (
    source: SourceRef,
    opts: { save_as_draft: boolean; send_mode: CampaignSendMode; is_qa?: boolean }
  ) => {
    const createRequestId = newClientIdempotencyKey();
    const res = await fetch("/api/admin/notification-campaigns", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestId },
      body: JSON.stringify(buildPayload(source, { ...opts, create_request_id: createRequestId })),
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

  /** ADM-04: PATCH a stored campaign with the current form (same parser as create). */
  const patchCampaign = async (campaignId: string, source: SourceRef): Promise<boolean> => {
    const payload: Record<string, unknown> = buildPayload(source, { save_as_draft: false, send_mode: sendMode });
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

  /** occurrence 가 없으면(멱등 재요청 · 초안) 서버가 활성 회차를 찾거나 만든다. */
  const runCampaignSend = async (campaignId: string, occurrenceId: string | null, reason: string | null) => {
    const sendKey = newClientIdempotencyKey();
    const sr = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}/send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": sendKey },
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
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; audience?: CampaignAudiencePreview; error?: string };
    if (!res.ok || !j.ok || !j.audience) {
      setErr(errorFrom(j));
      return null;
    }
    return j.audience;
  };

  const timeLabel = () => {
    if (sendMode === "scheduled") {
      return `${formatCampaignTime(toIsoOrNull(scheduledAt))} ${tx("예약", "(scheduled)")}`;
    }
    if (sendMode === "recurring") {
      return `${t(`admin_notif_recurrence_${recurrenceKind}`)} ${recurrenceTime}`;
    }
    return tx("즉시 발송", "Immediately");
  };

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

  const editingLive = Boolean(editId) && editStatus !== null && editStatus !== "draft";

  /** 실발송·예약 — 확인창 이후에만 원본 글을 게시한다 (취소하면 아무것도 만들지 않음). */
  const dispatch = async (reason: string | null) => {
    const source = await ensureSource(true);
    if (!source) return;
    if (editId) {
      if (!(await patchCampaign(editId, source))) return;
      if (editingLive) {
        // 예약·일시정지 캠페인 수정 = 내용만 저장 (상태는 그대로)
        router.push(`/admin/notifications/${editId}`);
        return;
      }
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
      return;
    }
    const result = await createCampaign(source, { save_as_draft: false, send_mode: sendMode });
    if (!result) return;
    if (sendMode === "immediate" && !(await runCampaignSend(result.id, result.occurrenceId, reason))) {
      // 캠페인은 만들어졌다 — 같은 버튼으로 다시 만들지 않도록 막고 상세로 안내한다.
      setCreatedUnsentId(result.id);
      return;
    }
    router.push(`/admin/notifications/${result.id}`);
  };

  /** [발송] = 대상 인원 조회 → 확인창 1회 → 발송. */
  const onSend = async () => {
    setErr(null);
    setInfo(null);
    if (!sendReady) return;
    setBusy(true);
    let preview: CampaignAudiencePreview | null = null;
    try {
      preview = await loadAudiencePreview();
    } finally {
      setBusy(false);
    }
    if (!preview) return;
    setConfirm({
      action: editingLive ? "save_edit" : sendMode === "immediate" ? "send" : "schedule",
      facts: {
        title: title.trim(),
        targetCount: preview.totalUsers,
        pushEligibleCount: preview.pushEligibleUsers,
        channelLabel: notifChannelLabel(t, channel),
        timeLabel: timeLabel(),
      },
      run: dispatch,
    });
  };

  const onSaveDraft = async () => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const source = await ensureSource(false);
      if (!source) return;
      if (editId) {
        if (await patchCampaign(editId, source)) router.push(`/admin/notifications/${editId}`);
        return;
      }
      const result = await createCampaign(source, { save_as_draft: true, send_mode: "immediate" });
      if (result) router.push(`/admin/notifications/${result.id}`);
    } finally {
      setBusy(false);
    }
  };

  const myUserId = adminMe?.userId ?? "";
  const testIds = [...new Set([myUserId, ...parseCampaignUserIds(extraTestIds)].filter(Boolean))].slice(0, 20);

  /** 테스트 = 내 폰(+고급에서 추가한 ID)으로만. 원본 글은 숨김 상태로 두고 화면에 머문다. */
  const onTestSend = async () => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const source = await ensureSource(false);
      if (!source) return;
      let campaignId = testCampaignIdRef.current;
      if (campaignId && !(await patchCampaign(campaignId, source))) {
        campaignId = null;
        setErr(null);
      }
      if (!campaignId) {
        const result = await createCampaign(source, { save_as_draft: true, send_mode: "immediate", is_qa: true });
        if (!result) return;
        campaignId = result.id;
        testCampaignIdRef.current = campaignId;
      }
      const testKey = newClientIdempotencyKey();
      const tr = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}/test-send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": testKey },
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

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadCampaignImage(file);
      if (!url) {
        setErr(campaignCreateErrorMessage("upload_failed", lang));
        return;
      }
      setImageUrl(url);
      setInAppImageOverride(null);
    } finally {
      setBusy(false);
    }
  };

  const sendLabel = editingLive
    ? safeT("admin_campaign_cms_btn_save_changes", { fallbackKo: "변경 저장", fallbackEn: "Save changes" })
    : sendMode === "scheduled"
      ? t("admin_notif_btn_confirm_schedule")
      : sendMode === "recurring"
        ? t("admin_notif_btn_start_recurring")
        : targetType === "all"
          ? t("admin_notif_btn_send_all_members")
          : t("admin_notif_btn_send_now");

  const typeLabel = (v: CampaignType) =>
    v === "notice" ? t("admin_notif_type_notice") : v === "system" ? t("admin_notif_type_system") : t("admin_notif_type_marketing");
  const targetOptions: { value: string; ko: string; en: string }[] = [
    { value: "all", ko: "전체 회원", en: "All members" },
    { value: "marketing_opt_in", ko: "마케팅 수신 동의 회원", en: "Marketing opt-in members" },
    { value: "active_users", ko: "최근 30일 활동 회원", en: "Active in last 30 days" },
    { value: "region", ko: "지역", en: "Region" },
    { value: "selected_users", ko: "회원 직접 지정", en: "Specific members" },
  ];
  const targetOption = targetOptions.find((o) => o.value === targetType);
  const weekdays = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timezoneLabel = recurrenceTimezone === "Asia/Manila" ? "PHT" : recurrenceTimezone;
  const createLocked = Boolean(createdUnsentId);
  const blocked = busy || createLocked || Boolean(editBlocked);

  const pickerFiltered = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    const pickable = pickerRows.filter((r) => isCampaignSourcePickable(r, type));
    if (!q) return pickable;
    return pickable.filter((r) => r.id.toLowerCase().includes(q) || String(r.title ?? "").toLowerCase().includes(q));
  }, [pickerQ, pickerRows, type]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← {t("admin_back_to_list")}
      </Link>
      <AdminPageHeader
        title={
          editId
            ? `${safeT("admin_campaign_cms_edit_title", { fallbackKo: "알림 수정", fallbackEn: "Edit notification" })}${editStatus ? ` · ${campaignStatusLabel(editStatus, lang)}` : ""}`
            : tx("알림 보내기", "Send notification")
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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 입력 — 기본은 유형 · 제목 · 메시지 · 대상 · 시점만 */}
        <section className="min-w-0 space-y-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("admin_notif_label_type")}>
            {(["notice", "system", "marketing"] as const).map((v) => (
              <AdminChipButton key={v} selected={type === v} disabled={editingLive} onClick={() => changeType(v)}>
                {typeLabel(v)}
              </AdminChipButton>
            ))}
          </div>

          <label className="block text-sm">
            <span className="text-sam-muted">{tx("제목", "Title")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
              placeholder={tx("예) 업데이트 안내", "e.g. Update available")}
            />
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

          {/* 원본 — 기본 = 자동 게시 (별도 작성 단계 없음) */}
          <div className="space-y-2 rounded-ui-rect bg-sam-app p-3 text-sm" data-admin-notif-source={sourceMode}>
            {sourceMode === "auto" ? (
              <>
                <p className="text-sam-fg">
                  {tx(
                    `발송하면 고객센터 ${typeLabel(type)} 게시판에 이 내용이 함께 게시되고, 회원이 알림을 누르면 그 글이 열립니다.`,
                    `Sending also posts this to the Customer Center ${typeLabel(type)} board; tapping the notification opens it.`
                  )}
                </p>
                <details>
                  <summary className="cursor-pointer text-sam-muted">
                    {tx("게시글 본문을 길게 쓰기 (비우면 메시지와 같음)", "Write a longer post body (empty = message)")}
                  </summary>
                  <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={5} className={fieldClass} />
                </details>
                <AdminActionButton variant="ghost" size="sm" onClick={() => void openPicker()}>
                  {tx("이미 있는 고객센터 글에 연결하기", "Link an existing post instead")}
                </AdminActionButton>
              </>
            ) : linkedId ? (
              <>
                <p className="text-sam-fg">
                  {tx("연결된 글", "Linked post")}: <span className="font-medium">{linkedContent?.title ?? linkedId}</span>
                  {linkedContent?.is_active === false ? (
                    <span className="text-sam-warning"> · {tx("숨김 — 발송할 때 게시됩니다", "hidden — published on send")}</span>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <AdminActionLink href={`/admin/app/notices/${encodeURIComponent(linkedId)}`} size="sm" target="_blank" rel="noreferrer">
                    {safeT("admin_notif_btn_view_original", { fallbackKo: "원본 보기", fallbackEn: "View original" })}
                  </AdminActionLink>
                  {!editingLive ? (
                    <>
                      <AdminActionButton variant="ghost" size="sm" onClick={() => void openPicker()}>
                        {safeT("admin_notif_btn_change_original", { fallbackKo: "원본 변경", fallbackEn: "Change original" })}
                      </AdminActionButton>
                      <AdminActionButton variant="ghost" size="sm" onClick={switchToAutoSource}>
                        {tx("새 글로 게시하기", "Post as new")}
                      </AdminActionButton>
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="text-sam-muted">{tx("랜딩 경로 (앱 내부)", "Landing path (in-app)")}</span>
                  <input value={deeplinkUrl} onChange={(e) => setDeeplinkUrl(e.target.value)} className={fieldClass} />
                </label>
                {!editingLive ? (
                  <AdminActionButton variant="ghost" size="sm" onClick={switchToAutoSource}>
                    {tx("새 글로 게시하기", "Post as new")}
                  </AdminActionButton>
                ) : null}
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="space-y-1 text-sm">
              <span className="text-sam-muted">{t("admin_notif_label_send_mode")}</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {(["immediate", "scheduled", "recurring"] as const).map((mode) => (
                  <AdminChipButton
                    key={mode}
                    selected={sendMode === mode}
                    disabled={!sendModeAllowed(mode)}
                    onClick={() => setSendMode(mode)}
                  >
                    {mode === "immediate" ? tx("지금", "Now") : mode === "scheduled" ? tx("예약", "Schedule") : tx("반복", "Repeat")}
                  </AdminChipButton>
                ))}
              </div>
            </div>
          </div>

          {targetType === "region" ? (
            <label className="block text-sm">
              <span className="text-sam-muted">{t("admin_notif_label_region_code")}</span>
              <input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} className={fieldClass} />
            </label>
          ) : null}
          {targetType === "selected_users" ? (
            <label className="block text-sm">
              <span className="text-sam-muted">
                {tx("회원 ID (줄바꿈·쉼표로 구분)", "Member IDs (newline or comma)")} · {parseCampaignUserIds(selectedIds).length}
              </span>
              <textarea
                value={selectedIds}
                onChange={(e) => setSelectedIds(e.target.value)}
                rows={3}
                className={`${fieldClass} font-mono text-xs`}
              />
            </label>
          ) : null}

          {sendMode === "scheduled" ? (
            <label className="block text-sm">
              <span className="text-sam-muted">{tx("예약 시각 (PHT)", "Scheduled time (PHT)")}</span>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={fieldClass} />
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
                  <input type="time" value={recurrenceTime} onChange={(e) => setRecurrenceTime(e.target.value)} className={fieldClass} />
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
            <summary className="cursor-pointer text-sam-muted">
              {tx("고급 설정 — 채널 · 이미지 · 테스트 수신자", "Advanced — channel · image · test recipients")}
            </summary>
            <div className="mt-3 space-y-4">
              <div className="space-y-1">
                <span className="text-sam-muted">{t("admin_notif_label_channel")}</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(["push_and_in_app", "push_only", "in_app_only"] as const).map((c) => (
                    <AdminChipButton key={c} selected={channel === c} onClick={() => setChannel(c)}>
                      {t(`admin_notif_channel_${c}`)}
                    </AdminChipButton>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sam-muted">{tx("이미지 (iOS 푸시는 표시 안 됨)", "Image (not shown in iOS push)")}</span>
                <div className="flex flex-wrap items-center gap-3">
                  {imageUrl ? (
                    <SamarketThumbnail src={imageUrl} alt="" className="h-14 w-14 rounded-ui-rect object-cover" size={56} />
                  ) : null}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block text-xs"
                    onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                  />
                  {imageUrl ? (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setImageUrl("");
                        setInAppImageOverride(null);
                      }}
                    >
                      {tx("이미지 빼기", "Remove image")}
                    </AdminActionButton>
                  ) : null}
                </div>
              </div>
              <label className="block">
                <span className="text-sam-muted">
                  {tx("테스트로 함께 받을 회원 ID (내 계정은 자동 포함)", "Extra test recipient IDs (my account included)")}
                </span>
                <textarea
                  value={extraTestIds}
                  onChange={(e) => setExtraTestIds(e.target.value)}
                  rows={2}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </label>
              <label className="block">
                <span className="text-sam-muted">{t("admin_notif_label_web_url")}</span>
                <input value={webUrl} onChange={(e) => setWebUrl(e.target.value)} className={fieldClass} />
              </label>
            </div>
          </details>
        </section>

        {/* 오른쪽 — 미리보기 · 버튼 */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-xs text-sam-muted">{tx("미리보기", "Preview")}</p>
            <div className="flex gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3" data-admin-notif-preview="1">
              {presentation.pushImageUrl ? (
                <SamarketThumbnail
                  src={presentation.pushImageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-ui-rect object-cover"
                  size={40}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sam-fg">{presentation.pushPayload.title}</p>
                <p className="line-clamp-3 text-xs text-sam-muted">{presentation.pushPayload.body}</p>
              </div>
            </div>
            <p className="text-xs text-sam-meta">
              {targetOption ? (lang === "ko" ? targetOption.ko : targetOption.en) : targetType} · {notifChannelLabel(t, channel)} ·{" "}
              {timeLabel()}
            </p>
          </div>

          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            {!sendReady ? (
              <ul className="space-y-1 text-sm text-sam-danger" data-admin-notif-missing={missingSend.length}>
                {missingSend.map((m) => (
                  <li key={m.id}>· {lang === "ko" ? m.ko : m.en}</li>
                ))}
              </ul>
            ) : null}
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

            <AdminActionButton
              variant="primary"
              className="w-full"
              disabled={blocked || !sendAction.allowed || !sendReady}
              title={sendAction.reason ?? undefined}
              onClick={() => void onSend()}
              data-admin-notif-review="1"
            >
              {sendLabel}
            </AdminActionButton>
            {!editingLive ? (
              <AdminActionButton
                variant="secondary"
                className="w-full"
                disabled={blocked || !draftReady || testIds.length === 0}
                onClick={() => void onTestSend()}
                data-admin-notif-test="1"
              >
                {tx("내 폰으로 테스트", "Test on my phone")}
              </AdminActionButton>
            ) : null}
            <div className="flex justify-between gap-2">
              {editId ? (
                <AdminActionLink href={`/admin/notifications/${encodeURIComponent(editId)}`} variant="ghost" size="sm">
                  {t("admin_notif_btn_cancel")}
                </AdminActionLink>
              ) : (
                <span />
              )}
              {!editingLive ? (
                <AdminActionButton variant="ghost" size="sm" disabled={blocked || !draftReady} onClick={() => void onSaveDraft()}>
                  {t("admin_notif_btn_draft")}
                </AdminActionButton>
              ) : null}
            </div>
            {!sendAction.allowed && sendAction.reason ? (
              <p className="text-xs text-sam-muted" data-admin-action-denied="1">
                {lang === "ko" ? `발송 비활성: ${sendAction.reason}` : `Send disabled: ${sendAction.reason}`}
              </p>
            ) : null}
          </div>
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
        <DibayOverlayRoot open onClose={() => setPickerOpen(false)} dismissible placement="center" zRole="dialog">
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[80vh] overflow-hidden !p-0`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-4 py-3">
              <h3 className={OverlayUi.title}>{tx(`게시 중인 ${typeLabel(type)} 글`, `Published ${typeLabel(type)} posts`)}</h3>
              <DibayOverlayButton roleTone="text" className="!min-h-9 !flex-none !px-2" onClick={() => setPickerOpen(false)}>
                {t("admin_notif_btn_cancel")}
              </DibayOverlayButton>
            </div>
            <div className="space-y-2 p-4">
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder={safeT("admin_notif_picker_search_ph", { fallbackKo: "제목 또는 ID 검색", fallbackEn: "Search title or ID" })}
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
                    <li className="py-6 text-center text-xs text-sam-muted">
                      {tx(`게시 중인 ${typeLabel(type)} 글이 없습니다. 새 글로 게시하세요.`, `No published ${typeLabel(type)} posts. Post as new.`)}
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </div>
  );
}
