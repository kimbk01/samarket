"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { CampaignSendMode } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { BOARD_LABEL, parseCustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { isPlatformEventPubliclyAvailable } from "@/lib/platform-events/publication";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { notifChannelLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import { formatCampaignTime } from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { campaignStatusLabel } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { readSelectedUserIdsFromPayload } from "@/lib/admin/notification-campaigns/selected-user-ids";
import {
  CAMPAIGN_APP_SCREEN_PRESETS,
  campaignCreateErrorMessage,
  campaignCreateMissingForSend,
  campaignCreateMissingForTest,
  campaignDestinationPayload,
  isCampaignSourcePickable,
  parseCampaignUserIds,
  resolveCampaignCreateType,
  type CampaignCreateFormState,
  type CampaignDestination,
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

type PickedPost = { id: string; title: string; content_type: string; is_active?: boolean | null };
type PickedEvent = { id: string; title: string };

type PostRow = {
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

type EventRow = {
  id: string;
  title: string;
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  archivedAt?: string | null;
};

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

function payloadString(payload: unknown, ...keys: string[]): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const p = payload as Record<string, unknown>;
  for (const k of keys) {
    if (typeof p[k] === "string" && (p[k] as string).trim()) return (p[k] as string).trim();
  }
  return "";
}

function newClientIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const fieldClass = "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-2 text-sm";

/**
 * 관리자 알림 보내기 v3 (Owner 승인 2026-10-30) — 한 화면 · 4가지 선택.
 * ① 내용 ② 누르면 열 화면(목적지) ③ 받는 사람 ④ 시점 → [내 폰으로 테스트] · [발송].
 * 유형(공지/마케팅)은 받는 사람·목적지로 정해지고, 고객센터 글을 따로 쓰지 않는다
 * (기본 목적지 = 알림 상세, 서버 `campaign-source-authority` inbox_detail).
 */
export function AdminNotificationCampaignCreatePage() {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminMe } = useAdminShell();
  const lang = language === "en" ? "en" : "ko";
  const tx = (ko: string, en: string) => (lang === "ko" ? ko : en);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destination, setDestination] = useState<CampaignDestination>("inbox");
  const [post, setPost] = useState<PickedPost | null>(null);
  const [event, setEvent] = useState<PickedEvent | null>(null);
  const [appPath, setAppPath] = useState("");
  const [targetType, setTargetType] = useState<string>("all");
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [sendMode, setSendMode] = useState<CampaignSendMode>("immediate");
  /** datetime-local 값 = PHT (`adminManilaInputToIso` 로 저장). */
  const [scheduledAt, setScheduledAt] = useState("");
  const [channel, setChannel] = useState<Channel>("push_and_in_app");
  const [imageUrl, setImageUrl] = useState("");
  /** 수정 모드에서 푸시·알림함 이미지가 달랐으면 알림함 이미지를 보존한다. */
  const [inAppImageOverride, setInAppImageOverride] = useState<string | null>(null);
  const [extraTestIds, setExtraTestIds] = useState("");
  // 반복 발송은 기존 반복 캠페인 수정에서만 보인다 (새 알림은 지금 · 예약).
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>("weekly");
  const [recurrenceTime, setRecurrenceTime] = useState("09:00");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceStartAt, setRecurrenceStartAt] = useState("");
  const [recurrenceEndAt, setRecurrenceEndAt] = useState("");
  const [recurrenceTimezone, setRecurrenceTimezone] = useState("Asia/Manila");

  const [picker, setPicker] = useState<"post" | "event" | null>(null);
  const [pickerQ, setPickerQ] = useState("");
  const [postRows, setPostRows] = useState<PostRow[]>([]);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
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
  // IA-01: 실제 수신자 발송·예약 = `manage` 키. 본인 테스트 발송은 그대로. 서버 가드가 최종 판정.
  const sendAction = useAdminRouteAction("/admin/notifications");

  const loadPost = async (id: string) => {
    const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(id)}`, { credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notice?: PickedPost };
    if (res.ok && j.ok && j.notice) setPost(j.notice);
    else setPost({ id, title: id, content_type: "notice" });
  };

  // 공지 상세 「알림 보내기」 등에서 열 때 — 목적지만 채운다 (내용은 운영자가 쓴다).
  useEffect(() => {
    if (searchParams.get("edit")) return;
    const qTitle = searchParams.get("title");
    if (qTitle) setTitle(qTitle);
    const qBody = searchParams.get("body");
    if (qBody) setBody(qBody);
    const qNotice = searchParams.get("appNoticeId")?.trim();
    if (qNotice) {
      setDestination("post");
      void loadPost(qNotice);
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
        const ch = str(c.channel);
        if (ch === "push_only" || ch === "in_app_only" || ch === "push_and_in_app" || ch === "test_only") {
          setChannel(ch);
        }
        setTargetType(str(c.target_type) || "all");
        const pushImg = str(c.push_image_url);
        const inAppImg = str(c.in_app_image_url);
        setImageUrl(pushImg || inAppImg);
        setInAppImageOverride(inAppImg && inAppImg !== pushImg ? inAppImg : null);
        setRegionCode(str(c.segment_region_code));
        setSelectedIds(readSelectedUserIdsFromPayload(c.target_payload).join("\n"));
        // 목적지 복원 — 글 · 이벤트 · 알림 상세 · 앱 화면(이전 방식 랜딩 포함)
        const contentId = payloadString(c.target_payload, "appNoticeId", "content_id");
        const eventId = payloadString(c.target_payload, "platform_event_id", "event_id");
        if (contentId) {
          setDestination("post");
          void loadPost(contentId);
        } else if (eventId) {
          setDestination("event");
          setEvent({ id: eventId, title: eventId });
        } else if (payloadString(c.target_payload, "destination") === "inbox_detail") {
          setDestination("inbox");
        } else if (str(c.deeplink_url) || str(c.target_url)) {
          setDestination("app");
          setAppPath(str(c.deeplink_url) || str(c.target_url));
        } else {
          setDestination("inbox");
        }
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

  const editingLive = Boolean(editId) && editStatus !== null && editStatus !== "draft";
  /** ADM-04: scheduled keeps `scheduled`, paused keeps `recurring`. */
  const sendModeAllowed = (mode: CampaignSendMode) => {
    if (editStatus === "scheduled") return mode === "scheduled";
    if (editStatus === "paused") return mode === "recurring";
    return true;
  };
  const sendModes: CampaignSendMode[] = sendMode === "recurring" ? ["immediate", "scheduled", "recurring"] : ["immediate", "scheduled"];

  const type = resolveCampaignCreateType({ destination, targetType, postContentType: post?.content_type });
  const deeplink =
    destination === "post" && post
      ? buildCustomerCenterBoardDetailPath(parseCustomerCenterContentType(post.content_type, "notice"), post.id)
      : destination === "event" && event
        ? buildPlatformEventDetailPath(event.id)
        : destination === "app"
          ? appPath.trim()
          : "";
  const inAppImage = inAppImageOverride ?? imageUrl;

  const presentation = useMemo(
    () =>
      buildAdminCampaignNotificationPresentation({
        title: title.trim() || "DIBAY",
        body: body.trim() || "-",
        type,
        channel,
        deeplink_url: deeplink || null,
        web_url: null,
        push_image_url: imageUrl || null,
        in_app_image_url: inAppImage || null,
        target_type: targetType,
        appNoticeId: destination === "post" ? post?.id ?? null : null,
      }),
    [title, body, type, channel, deeplink, imageUrl, inAppImage, targetType, destination, post]
  );

  const formState: CampaignCreateFormState = {
    destination,
    title,
    body,
    postId: post?.id ?? "",
    eventId: event?.id ?? "",
    appPath,
    targetType,
    regionCode,
    selectedIds,
    sendMode,
    scheduledAt,
  };
  const missingTest = campaignCreateMissingForTest(formState);
  const missingSend = campaignCreateMissingForSend(formState);
  const sendReady = missingSend.length === 0;

  const errorFrom = (j: { error?: unknown }) => campaignCreateErrorMessage(j.error, lang);
  const toIsoOrNull = (local: string) => (local ? (adminManilaInputToIso(local) ?? null) : null);

  /** 생성·수정·테스트가 같은 본문을 쓴다 (서버 `parseCampaignWriteInput` 한 곳에서 검사). */
  const buildPayload = () => {
    const destinationPayload =
      destination === "event" && event ? { platform_event_id: event.id } : campaignDestinationPayload(destination);
    return {
      title,
      body,
      type,
      channel,
      target_type: targetType,
      deeplink_url: deeplink || null,
      web_url: null,
      push_image_url: imageUrl || null,
      in_app_image_url: inAppImage || null,
      segment_region_code: targetType === "region" ? regionCode : null,
      target_user_ids: targetType === "selected_users" ? parseCampaignUserIds(selectedIds) : undefined,
      app_notice_id: destination === "post" ? post?.id ?? null : null,
      ...(destinationPayload ? { target_payload: destinationPayload } : {}),
      send_mode: sendMode,
      scheduled_at: sendMode === "scheduled" ? toIsoOrNull(scheduledAt) : null,
      recurrence_kind: sendMode === "recurring" ? recurrenceKind : undefined,
      recurrence_time: sendMode === "recurring" ? recurrenceTime : null,
      recurrence_timezone: recurrenceTimezone,
      recurrence_start_at:
        sendMode === "recurring" ? (toIsoOrNull(recurrenceStartAt) ?? new Date().toISOString()) : null,
      recurrence_end_at: sendMode === "recurring" ? toIsoOrNull(recurrenceEndAt) : null,
      recurrence_weekday: sendMode === "recurring" && recurrenceKind === "weekly" ? recurrenceWeekday : null,
    };
  };

  const patchCampaign = async (campaignId: string): Promise<boolean> => {
    const res = await fetch(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
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

  const timeLabel = () => {
    if (sendMode === "scheduled") return `${formatCampaignTime(toIsoOrNull(scheduledAt))} ${tx("예약", "(scheduled)")}`;
    if (sendMode === "recurring") return `${t(`admin_notif_recurrence_${recurrenceKind}`)} ${recurrenceTime}`;
    return tx("즉시 발송", "Immediately");
  };

  /** 확인창 이후 실행 — 새 알림: 생성 → (지금이면) 발송 · 수정: 저장 → (초안이면) 발송·예약. */
  const dispatch = async (reason: string | null) => {
    if (editId) {
      if (!(await patchCampaign(editId))) return;
      if (!editingLive) {
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
      }
      router.push(`/admin/notifications/${editId}`);
      return;
    }
    const createKey = newClientIdempotencyKey();
    const res = await fetch("/api/admin/notification-campaigns", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": createKey },
      body: JSON.stringify({ ...buildPayload(), save_as_draft: false, create_request_id: createKey }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; occurrence_id?: string | null; error?: string };
    if (!res.ok || !j.ok || !j.id) {
      setErr(errorFrom(j));
      return;
    }
    if (sendMode === "immediate" && !(await runCampaignSend(j.id, j.occurrence_id ?? null, reason))) {
      // 캠페인은 만들어졌다 — 같은 버튼으로 다시 만들지 않도록 막고 상세로 안내한다.
      setCreatedUnsentId(j.id);
      return;
    }
    router.push(`/admin/notifications/${j.id}`);
  };

  /**
   * [발송] = 「전송하시겠습니까?」 확인 1회 → 실행 (Owner 2026-10-30: 대상 수 재입력·사유 입력 삭제).
   * 받는 사람 수는 발송 결과(상세 화면)에서 확인한다.
   */
  const onSend = async () => {
    setErr(null);
    setInfo(null);
    if (!sendReady || busy) return;
    const ko = lang === "ko";
    const who = targetOption ? (ko ? targetOption.ko : targetOption.en) : targetType;
    // Owner 2026-10-30: 발송 확인은 「전송하시겠습니까?」 1회 (대상 수 재입력·사유 없음) = 저장 등급.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: editingLive
        ? tx("변경 내용을 저장하시겠습니까?", "Save changes?")
        : sendMode === "immediate"
          ? tx("전송하시겠습니까?", "Send now?")
          : tx("예약하시겠습니까?", "Schedule this?"),
      description: `${who} · ${timeLabel()}`,
      confirmLabel: editingLive ? tx("저장", "Save") : sendMode === "immediate" ? tx("전송", "Send") : tx("예약", "Schedule"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    try {
      await dispatch(null);
    } finally {
      setBusy(false);
    }
  };

  /** 초안 수정 — 발송하지 않고 저장만. */
  const onSaveDraftEdit = async () => {
    if (!editId) return;
    setErr(null);
    setBusy(true);
    try {
      if (await patchCampaign(editId)) router.push(`/admin/notifications/${editId}`);
    } finally {
      setBusy(false);
    }
  };

  const myUserId = adminMe?.userId ?? "";
  const testIds = [...new Set([myUserId, ...parseCampaignUserIds(extraTestIds)].filter(Boolean))].slice(0, 20);

  /** 테스트 = 작성 중인 내용 그대로 내 계정(+추가 ID)에만. 캠페인 목록은 늘지 않는다 (관리자별 sandbox 1건). */
  const onTestSend = async () => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const key = newClientIdempotencyKey();
      const res = await fetch("/api/admin/notification-campaigns/test-send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ ...buildPayload(), send_mode: "immediate", user_ids: testIds }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        skipped?: number;
        failed?: number;
      };
      if (!res.ok || !j.ok) {
        setErr(errorFrom(j));
        return;
      }
      setInfo(
        tx(
          `테스트 발송 완료 · 발송 ${j.sent ?? 0} · 건너뜀 ${j.skipped ?? 0} · 실패 ${j.failed ?? 0}`,
          `Test sent · sent ${j.sent ?? 0} · skipped ${j.skipped ?? 0} · failed ${j.failed ?? 0}`
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

  const openPicker = async (kind: "post" | "event") => {
    setPicker(kind);
    setPickerQ("");
    setPickerLoading(true);
    try {
      if (kind === "post") {
        const res = await fetch("/api/admin/app-notices", { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notices?: PostRow[] };
        setPostRows(res.ok && j.ok && Array.isArray(j.notices) ? j.notices.filter((r) => isCampaignSourcePickable(r)) : []);
      } else {
        const res = await fetch("/api/admin/platform-events", { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; events?: EventRow[] };
        setEventRows(
          res.ok && j.ok && Array.isArray(j.events)
            ? j.events.filter((e) =>
                isPlatformEventPubliclyAvailable({
                  status: e.status,
                  startsAt: e.startsAt,
                  endsAt: e.endsAt,
                  archivedAt: e.archivedAt,
                })
              )
            : []
        );
      }
    } finally {
      setPickerLoading(false);
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

  const destinationOptions: { id: CampaignDestination; ko: string; en: string }[] = [
    { id: "inbox", ko: "알림 내용 보기", en: "Notification detail" },
    { id: "post", ko: "고객센터 글", en: "Customer Center post" },
    { id: "event", ko: "이벤트", en: "Event" },
    { id: "app", ko: "앱 화면", en: "App screen" },
  ];
  const targetOptions: { value: string; ko: string; en: string }[] = [
    { value: "all", ko: "전체 회원", en: "All members" },
    { value: "marketing_opt_in", ko: "광고 수신 동의 회원", en: "Marketing opt-in members" },
    { value: "selected_users", ko: "회원 지정", en: "Specific members" },
    { value: "active_users", ko: "최근 30일 활동 회원", en: "Active in last 30 days" },
    { value: "region", ko: "지역", en: "Region" },
  ];
  const targetOption = targetOptions.find((o) => o.value === targetType);
  const weekdays = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const blocked = busy || Boolean(createdUnsentId) || Boolean(editBlocked);
  const q = pickerQ.trim().toLowerCase();
  const pickerPosts = postRows.filter((r) => !q || r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  const pickerEvents = eventRows.filter((r) => !q || r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));

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
        <p className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg">{editBlocked}</p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          {/* ① 내용 */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-sam-fg">{tx("① 내용", "① Message")}</h2>
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
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={fieldClass} />
              <span className={`mt-1 block text-right text-xs ${body.length > BODY_GUIDE_MAX ? "text-sam-warning" : "text-sam-meta"}`}>
                {body.length}/{BODY_GUIDE_MAX}
              </span>
            </label>
          </div>

          {/* ② 누르면 열 화면 */}
          <div className="space-y-3" data-admin-notif-destination={destination}>
            <h2 className="text-sm font-semibold text-sam-fg">{tx("② 누르면 열 화면", "② Opens on tap")}</h2>
            <div className="flex flex-wrap gap-2">
              {destinationOptions.map((o) => (
                <AdminChipButton
                  key={o.id}
                  selected={destination === o.id}
                  disabled={editingLive}
                  onClick={() => setDestination(o.id)}
                >
                  {lang === "ko" ? o.ko : o.en}
                </AdminChipButton>
              ))}
            </div>
            {destination === "inbox" ? (
              <p className="text-xs text-sam-muted">
                {tx("회원이 알림을 누르면 위 메시지 전문이 알림 상세 화면에 열립니다.", "Tapping opens the full message on the notification detail page.")}
              </p>
            ) : null}
            {destination === "post" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {post ? (
                  <span className="text-sam-fg">
                    {BOARD_LABEL[parseCustomerCenterContentType(post.content_type, "notice")][lang]} · {post.title}
                    {post.is_active === false ? <span className="text-sam-warning"> · {tx("숨김", "hidden")}</span> : null}
                  </span>
                ) : null}
                {!editingLive ? (
                  <AdminActionButton variant="secondary" size="sm" onClick={() => void openPicker("post")}>
                    {post ? tx("다른 글", "Change") : tx("글 고르기", "Choose post")}
                  </AdminActionButton>
                ) : null}
              </div>
            ) : null}
            {destination === "event" ? (
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {event ? <span className="text-sam-fg">{event.title}</span> : null}
                  {!editingLive ? (
                    <AdminActionButton variant="secondary" size="sm" onClick={() => void openPicker("event")}>
                      {event ? tx("다른 이벤트", "Change") : tx("이벤트 고르기", "Choose event")}
                    </AdminActionButton>
                  ) : null}
                </div>
                <p className="text-xs text-sam-muted">{tx("이벤트 알림은 광고성이라 광고 수신 동의 회원에게만 갑니다.", "Event notifications are promotional: opted-in members only.")}</p>
              </div>
            ) : null}
            {destination === "app" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {CAMPAIGN_APP_SCREEN_PRESETS.map((p) => (
                    <AdminChipButton key={p.path} selected={appPath === p.path} disabled={editingLive} onClick={() => setAppPath(p.path)}>
                      {lang === "ko" ? p.ko : p.en}
                    </AdminChipButton>
                  ))}
                </div>
                <input
                  value={appPath}
                  onChange={(e) => setAppPath(e.target.value)}
                  disabled={editingLive}
                  placeholder={tx("또는 앱 경로 직접 입력 (예: /market)", "Or type an in-app path (e.g. /market)")}
                  className={fieldClass}
                />
              </div>
            ) : null}
          </div>

          {/* ③ 받는 사람 · ④ 시점 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold text-sam-fg">{tx("③ 받는 사람", "③ Recipients")}</span>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className={fieldClass}>
                {targetOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {lang === "ko" ? o.ko : o.en}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <span className="font-semibold text-sam-fg">{tx("④ 시점", "④ When")}</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {sendModes.map((mode) => (
                  <AdminChipButton key={mode} selected={sendMode === mode} disabled={!sendModeAllowed(mode)} onClick={() => setSendMode(mode)}>
                    {mode === "immediate" ? tx("지금", "Now") : mode === "scheduled" ? tx("예약", "Schedule") : tx("반복", "Repeat")}
                  </AdminChipButton>
                ))}
              </div>
            </div>
          </div>
          {type === "marketing" ? (
            <p className="text-xs text-sam-muted">{tx("광고성 알림 — 광고 수신에 동의한 회원에게만 발송됩니다.", "Promotional — sent to opted-in members only.")}</p>
          ) : null}

          {targetType === "selected_users" ? (
            <label className="block text-sm">
              <span className="text-sam-muted">
                {tx("회원 ID (줄바꿈·쉼표로 구분)", "Member IDs (newline or comma)")} · {parseCampaignUserIds(selectedIds).length}
              </span>
              <textarea value={selectedIds} onChange={(e) => setSelectedIds(e.target.value)} rows={3} className={`${fieldClass} font-mono text-xs`} />
            </label>
          ) : null}
          {targetType === "region" ? (
            <label className="block text-sm">
              <span className="text-sam-muted">{t("admin_notif_label_region_code")}</span>
              <input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} className={fieldClass} />
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
                    {tx("발송 시각", "Send time")} ({recurrenceTimezone === "Asia/Manila" ? "PHT" : recurrenceTimezone})
                  </span>
                  <input type="time" value={recurrenceTime} onChange={(e) => setRecurrenceTime(e.target.value)} className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="text-sam-muted">{tx("시작", "Starts")}</span>
                  <input type="datetime-local" value={recurrenceStartAt} onChange={(e) => setRecurrenceStartAt(e.target.value)} className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="text-sam-muted">{tx("종료 (비우면 계속)", "Ends (empty = no end)")}</span>
                  <input type="datetime-local" value={recurrenceEndAt} onChange={(e) => setRecurrenceEndAt(e.target.value)} className={fieldClass} />
                </label>
              </div>
            </div>
          ) : null}

          <details className="rounded-ui-rect border border-sam-border-soft p-3 text-sm">
            <summary className="cursor-pointer text-sam-muted">{tx("고급 설정 — 채널 · 이미지 · 테스트 수신자", "Advanced — channel · image · test recipients")}</summary>
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
                  {imageUrl ? <SamarketThumbnail src={imageUrl} alt="" className="h-14 w-14 rounded-ui-rect object-cover" size={56} /> : null}
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
                <span className="text-sam-muted">{tx("테스트로 함께 받을 회원 ID (내 계정은 자동 포함)", "Extra test recipient IDs (my account included)")}</span>
                <textarea value={extraTestIds} onChange={(e) => setExtraTestIds(e.target.value)} rows={2} className={`${fieldClass} font-mono text-xs`} />
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
                <SamarketThumbnail src={presentation.pushImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-ui-rect object-cover" size={40} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sam-fg">{presentation.pushPayload.title}</p>
                <p className="line-clamp-3 text-xs text-sam-muted">{presentation.pushPayload.body}</p>
              </div>
            </div>
            <p className="text-xs text-sam-meta">
              {targetOption ? (lang === "ko" ? targetOption.ko : targetOption.en) : targetType} · {notifChannelLabel(t, channel)} · {timeLabel()}
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
            <AdminActionButton
              variant="secondary"
              className="w-full"
              disabled={blocked || missingTest.length > 0 || testIds.length === 0}
              onClick={() => void onTestSend()}
              data-admin-notif-test="1"
            >
              {tx("내 폰으로 테스트", "Test on my phone")}
            </AdminActionButton>
            {editId ? (
              <div className="flex justify-between gap-2">
                <AdminActionLink href={`/admin/notifications/${encodeURIComponent(editId)}`} variant="ghost" size="sm">
                  {t("admin_notif_btn_cancel")}
                </AdminActionLink>
                {editStatus === "draft" ? (
                  <AdminActionButton variant="secondary" size="sm" disabled={blocked || missingTest.length > 0} onClick={() => void onSaveDraftEdit()}>
                    {safeT("admin_campaign_cms_btn_save_changes", { fallbackKo: "변경 저장", fallbackEn: "Save changes" })}
                  </AdminActionButton>
                ) : null}
              </div>
            ) : null}
            {!sendAction.allowed && sendAction.reason ? (
              <p className="text-xs text-sam-muted" data-admin-action-denied="1">
                {lang === "ko" ? `발송 비활성: ${sendAction.reason}` : `Send disabled: ${sendAction.reason}`}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {picker ? (
        <DibayOverlayRoot open onClose={() => setPicker(null)} dismissible placement="center" zRole="dialog">
          <div className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[80vh] overflow-hidden !p-0`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-4 py-3">
              <h3 className={OverlayUi.title}>
                {picker === "post" ? tx("게시 중인 고객센터 글", "Published posts") : tx("진행 중인 이벤트", "Live events")}
              </h3>
              <DibayOverlayButton roleTone="text" className="!min-h-9 !flex-none !px-2" onClick={() => setPicker(null)}>
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
                  {picker === "post"
                    ? pickerPosts.map((row) => (
                        <li key={row.id}>
                          <AdminListItemButton
                            className="border border-sam-border-soft"
                            onClick={() => {
                              setPost({ id: row.id, title: row.title, content_type: String(row.content_type ?? "notice"), is_active: row.is_active });
                              setPicker(null);
                            }}
                          >
                            <span className="mr-2 text-xs text-sam-muted">{BOARD_LABEL[parseCustomerCenterContentType(row.content_type, "notice")][lang]}</span>
                            <span className="text-sm font-medium text-sam-fg">{row.title}</span>
                          </AdminListItemButton>
                        </li>
                      ))
                    : pickerEvents.map((row) => (
                        <li key={row.id}>
                          <AdminListItemButton
                            className="border border-sam-border-soft"
                            onClick={() => {
                              setEvent({ id: row.id, title: row.title });
                              setPicker(null);
                            }}
                          >
                            <span className="text-sm font-medium text-sam-fg">{row.title}</span>
                          </AdminListItemButton>
                        </li>
                      ))}
                  {(picker === "post" ? pickerPosts.length : pickerEvents.length) === 0 ? (
                    <li className="py-6 text-center text-xs text-sam-muted">
                      {picker === "post"
                        ? tx("게시 중인 글이 없습니다. 「알림 내용 보기」로 보내세요.", "No published posts. Use notification detail.")
                        : tx("진행 중인 이벤트가 없습니다.", "No live events.")}
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
