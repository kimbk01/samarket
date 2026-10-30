"use client";

import Link from "next/link";
import { useAdminAutoRefresh } from "@/lib/admin/use-admin-auto-refresh";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  notifChannelLabel,
  notifStatusLabel,
  notifTargetLabel,
  notifTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
import { CampaignActionConfirmDialog } from "@/components/admin/notifications/CampaignActionConfirmDialog";
import {
  formatCampaignTime,
  type CampaignConfirmAction,
  type CampaignConfirmFacts,
} from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";
import {
  campaignStatusLabel,
  type CampaignAction,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import { isInboxDetailDestinationPayload } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { readSelectedUserIdsFromPayload } from "@/lib/admin/notification-campaigns/selected-user-ids";
import {
  BOARD_LABEL,
  parseCustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { NOTIFICATIONS_PUSH_DELIVERY_STATUS_NS } from "@/lib/admin/status-labels/notifications-status-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import type { PushFailureBreakdown, PushFailureReason } from "@/lib/admin/notification-campaigns/campaign-push-failure-breakdown";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

function newSendIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type CampaignSummary = {
  occurrence_id?: string;
  status?: string;
  target_member_count?: number;
  push_eligible_member_count?: number;
  push_device_count?: number;
  in_app_member_count?: number;
  push_sent?: number;
  push_skipped?: number;
  push_failed?: number;
  in_app_sent?: number;
  in_app_skipped?: number;
  in_app_failed?: number;
  scheduled_for?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  opened?: OpenedCounts | null;
};

type OpenedCounts = { push: number; in_app: number; capped?: boolean };

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  target_count: number | null;
  created_at: string;
};

type PendingConfirm = {
  action: CampaignConfirmAction;
  facts: CampaignConfirmFacts;
  /** 재발송(L3) 확인창 사유 — 발송 API 로 보내 감사에 남긴다. L1 동작은 null. */
  run: (reason: string | null) => Promise<void>;
};

type OccurrenceRow = {
  id: string;
  sequence_number: number;
  trigger_type: string;
  status: string;
  scheduled_for: string | null;
  push_sent: number;
  push_device_count: number;
  in_app_sent: number;
  in_app_member_count: number;
  target_member_count?: number;
  started_at: string | null;
  completed_at: string | null;
  last_error?: string | null;
  opened?: OpenedCounts | null;
};

type DeviceLogRow = {
  userId: string;
  deviceId: string | null;
  channel: string;
  status: string;
  skipReason: string | null;
  sentAt: string | null;
  updatedAt: string | null;
};

type LinkedContent = {
  id: string;
  content_type: string;
  title: string;
  hero_image_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

import type { MessageKey } from "@/lib/i18n/messages";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function sendModeLabel(t: TFn, mode: string | undefined): string {
  if (mode === "scheduled") return t("admin_notif_send_mode_scheduled");
  if (mode === "recurring") return t("admin_notif_send_mode_recurring");
  return t("admin_notif_send_mode_immediate");
}

function readLinkedContentId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

function readLinkedPlatformEventId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.platform_event_id === "string") return p.platform_event_id.trim();
  return "";
}

/** 푸시 실패 원인 문구 — 근거는 FCM·APNs 응답 (`campaign-push-failure-breakdown`). */
function pushFailureReasonLabel(reason: PushFailureReason, lang: "ko" | "en"): string {
  const ko = { expired_token: "만료된 기기", invalid_token: "잘못된 기기 토큰", temporary: "일시적 전송 오류", other: "기타 오류" };
  const en = { expired_token: "Expired device", invalid_token: "Invalid device token", temporary: "Temporary send error", other: "Other error" };
  return (lang === "en" ? en : ko)[reason];
}

function pushFailureReasonHelp(reason: PushFailureReason, lang: "ko" | "en"): string {
  if (lang === "en") {
    if (reason === "expired_token") return "The app was deleted or reinstalled on that phone, so Google/Apple rejected the old token. The device was turned off automatically and is excluded from the next send.";
    if (reason === "invalid_token") return "The stored token is malformed. The device was turned off; the member gets a new token when they open the app.";
    if (reason === "temporary") return "Network or provider hiccup. Resending usually works.";
    return "See the provider response below.";
  }
  if (reason === "expired_token") return "그 폰에서 앱을 지웠거나 다시 설치해 Google·Apple 이 예전 토큰을 거부했습니다. 해당 기기는 자동으로 꺼져 다음 발송부터 제외됩니다.";
  if (reason === "invalid_token") return "저장된 기기 토큰 형식이 잘못됐습니다. 기기는 꺼졌고, 회원이 앱을 열면 새 토큰이 등록됩니다.";
  if (reason === "temporary") return "네트워크·서버 일시 오류입니다. 다시 보내면 대부분 전송됩니다.";
  return "아래 FCM·APNs 응답을 확인하세요.";
}

export function AdminNotificationCampaignDetailPage() {
  const { t, safeT, language } = useI18n();
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.campaignId === "string" ? params.campaignId : "";
  const lang = language === "en" ? "en" : "ko";

  const [camp, setCamp] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  /** 푸시 실패 원인 — 실패가 있는 회차만 조회 (발송 기록의 FCM·APNs 응답). */
  const [failures, setFailures] = useState<PushFailureBreakdown | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [deviceDeliveryLog, setDeviceDeliveryLog] = useState<DeviceLogRow[]>([]);
  const [linkedContent, setLinkedContent] = useState<LinkedContent | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // IA-01: 실제 수신자 발송·재개 = `manage` 키 (접근표 /admin/notifications action) — 서버 가드가 최종 판정
  const sendAction = useAdminRouteAction("/admin/notifications");
  const [err, setErr] = useState<string | null>(null);
  /** 캠페인 불러오기 실패 — 표준 오류·빈 상태 (조치 오류 `err` 와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [sendConfirm, setSendConfirm] = useState<{
    audience: CampaignAudiencePreview;
    idempotencyKey: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [allowedActions, setAllowedActions] = useState<CampaignAction[]>([]);
  const [effectiveStatus, setEffectiveStatus] = useState<string>("");
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditSupported, setAuditSupported] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/${id}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        campaign?: Record<string, unknown>;
        summary?: CampaignSummary | null;
        occurrences?: OccurrenceRow[];
        deviceDeliveryLog?: DeviceLogRow[];
        allowed_actions?: CampaignAction[];
        effective_status?: string;
        author_name?: string | null;
        audit_logs?: AuditLogRow[];
        audit_supported?: boolean;
      };
      if (res.ok && j?.ok) {
        setCamp(j.campaign ?? null);
        setAllowedActions(Array.isArray(j.allowed_actions) ? j.allowed_actions : []);
        setEffectiveStatus(typeof j.effective_status === "string" ? j.effective_status : "");
        setAuthorName(typeof j.author_name === "string" ? j.author_name : null);
        setAuditLogs(Array.isArray(j.audit_logs) ? j.audit_logs : []);
        setAuditSupported(j.audit_supported !== false);
        setSummary(j.summary ?? null);
        setOccurrences(Array.isArray(j.occurrences) ? j.occurrences : []);
        setDeviceDeliveryLog(Array.isArray(j.deviceDeliveryLog) ? j.deviceDeliveryLog : []);
        setErr(null);
        setLoadErr(null);
      } else {
        setErr(t("admin_notif_not_found"));
        setLoadErr({ code: adminSafeErrorCode(j?.error, "load_failed"), httpStatus: res.status });
      }
    } catch {
      setLoadErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
    // `t` omitted on purpose: i18n boot recreates `t` and was re-triggering refresh → prolonged "불러오는 중…".
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const eventId = readLinkedPlatformEventId(camp?.target_payload);
    if (eventId) {
      let cancelled = false;
      void (async () => {
        try {
          const res = await fetch(`/api/admin/platform-events/${encodeURIComponent(eventId)}`, {
            credentials: "include",
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            event?: { id?: string; title?: string };
          };
          if (cancelled) return;
          if (res.ok && j.ok && j.event?.id) {
            setLinkedEvent({
              id: j.event.id,
              title: String(j.event.title || eventId).trim() || eventId,
            });
            setLinkedContent(null);
          } else {
            setLinkedEvent({
              id: eventId,
              title: language === "en" ? "Source unavailable" : "원본 확인 불가",
            });
            setLinkedContent(null);
          }
        } catch {
          if (!cancelled) {
            setLinkedEvent({
              id: eventId,
              title: language === "en" ? "Source unavailable" : "원본 확인 불가",
            });
            setLinkedContent(null);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const contentId = readLinkedContentId(camp?.target_payload);
    if (!contentId) {
      setLinkedContent(null);
      setLinkedEvent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(contentId)}`, {
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notice?: LinkedContent;
        };
        if (cancelled) return;
        setLinkedEvent(null);
        if (res.ok && j.ok && j.notice) setLinkedContent(j.notice);
        else setLinkedContent(null);
      } catch {
        if (!cancelled) {
          setLinkedEvent(null);
          setLinkedContent(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camp?.target_payload]);

  const isSending = summary?.status === "sending" || occurrences.some((o) => o.status === "sending");

  const failureOccurrenceId = summary?.occurrence_id && (summary.push_failed ?? 0) > 0 && !isSending ? summary.occurrence_id : "";
  useEffect(() => {
    if (!failureOccurrenceId) {
      setFailures(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/admin/notification-campaigns/${encodeURIComponent(id)}/failures?occurrence_id=${encodeURIComponent(failureOccurrenceId)}`,
        { credentials: "include" }
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<PushFailureBreakdown>;
      if (cancelled) return;
      setFailures(res.ok && j.ok ? { total: j.total ?? 0, byReason: j.byReason ?? [], devices: j.devices ?? [] } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, failureOccurrenceId]);

  // 발송 중일 때만 5초 진행률 갱신 — 탭이 숨겨지면 멈춤 · 이전 조회 진행 중이면 건너뜀
  useAdminAutoRefresh(refresh, { intervalMs: 5000, enabled: isSending });

  const cancelOccurrence = async (occurrenceId: string) => {
    const res = await fetch(`/api/admin/notification-campaigns/occurrences/${occurrenceId}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j?.ok) {
      setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
      return;
    }
    await refresh();
  };

  /** Lifecycle action (ADM-03 cancel/stop, pause/resume, archive, duplicate). */
  const runLifecycleAction = async (action: CampaignAction) => {
    const res = await fetch(`/api/admin/notification-campaigns/${id}/actions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string };
    if (!res.ok || !j?.ok) {
      setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
      return;
    }
    if (action === "duplicate" && typeof j.id === "string") {
      router.push(`/admin/notifications/create?edit=${encodeURIComponent(j.id)}`);
      return;
    }
    await refresh();
  };

  /** Resend a failed real occurrence through the same send route (claim + batch). */
  const resendOccurrence = async (occurrenceId: string, reason: string | null) => {
    const key = newSendIdempotencyKey();
    const res = await fetch(`/api/admin/notification-campaigns/${id}/send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ idempotency_key: key, occurrence_id: occurrenceId, reason }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j?.ok) {
      setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
    }
    await refresh();
  };

  const runConfirmed = async (reason: string | null) => {
    if (!pendingConfirm || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await pendingConfirm.run(reason);
      setPendingConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  // EVENT-01/02 + DEF-03: draft send allowed for selected_users when selected_user_ids were persisted.
  const draftSelectedUserIds = readSelectedUserIdsFromPayload(camp?.target_payload);
  const canSendDraft =
    String(camp?.status ?? "") === "draft" &&
    !isSending &&
    String(camp?.channel ?? "") !== "test_only" &&
    (String(camp?.target_type ?? "") !== "selected_users" || draftSelectedUserIds.length > 0) &&
    // Same guard as the server: a draft that already has a real occurrence was sent / is sending.
    !occurrences.some((o) => o.trigger_type !== "test");

  const openSendConfirm = async () => {
    if (busy || !camp) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notification-campaigns/audience-preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: camp.type,
          channel: camp.channel,
          target_type: camp.target_type,
          segment_region_code: camp.segment_region_code ?? null,
          target_user_ids:
            String(camp.target_type ?? "") === "selected_users" ? draftSelectedUserIds : undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        audience?: CampaignAudiencePreview;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.audience) {
        setErr(typeof j.error === "string" ? j.error : t("admin_notif_err_save"));
        return;
      }
      setSendConfirm({ audience: j.audience, idempotencyKey: newSendIdempotencyKey() });
    } finally {
      setBusy(false);
    }
  };

  const channelText = notifChannelLabel(t, String(camp?.channel ?? "push_and_in_app"));
  const latestReal = occurrences.find((o) => o.trigger_type !== "test") ?? null;
  const latestTargetCount =
    latestReal?.target_member_count ??
    summary?.target_member_count ??
    (camp?.target_count != null ? Number(camp.target_count) : null);
  const factsFor = (timeLabel: string, targetCount: number | null = latestTargetCount): CampaignConfirmFacts => ({
    title: String(camp?.title ?? ""),
    targetCount,
    channelLabel: channelText,
    timeLabel,
  });
  const openConfirm = (
    action: CampaignConfirmAction,
    facts: CampaignConfirmFacts,
    run: (reason: string | null) => Promise<void>
  ) => {
    setErr(null);
    setPendingConfirm({ action, facts, run });
  };
  const queuedReal = occurrences.find((o) => o.status === "queued" && o.trigger_type !== "test") ?? null;
  const failedReal = occurrences.find((o) => o.status === "failed" && o.trigger_type !== "test") ?? null;
  const can = (a: CampaignAction) => allowedActions.includes(a);
  const nowLabel = safeT("admin_campaign_cms_time_now", { fallbackKo: "지금", fallbackEn: "Now" });
  const formatOpenedCounts = (o: OpenedCounts | null | undefined) =>
    o
      ? safeT("admin_campaign_cms_push_in_app_counts", { fallbackKo: `푸시 ${o.push}${o.capped ? "+" : ""} · 인앱 ${o.in_app}${o.capped ? "+" : ""}`, fallbackEn: `Push ${o.push}${o.capped ? "+" : ""} · In-app ${o.in_app}${o.capped ? "+" : ""}`, vars: { push: `${o.push}${o.capped ? "+" : ""}`, in_app: `${o.in_app}${o.capped ? "+" : ""}` } })
      : "—";

  const confirmSend = async (reason: string | null) => {
    if (busy || !sendConfirm) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/${id}/send`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": sendConfirm.idempotencyKey,
        },
        body: JSON.stringify({ idempotency_key: sendConfirm.idempotencyKey, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
        return;
      }
      setSendConfirm(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!id) {
    return <p className="p-4 text-sm text-sam-muted">{t("admin_notif_err_invalid_route")}</p>;
  }

  const linkedId = readLinkedContentId(camp?.target_payload);
  const linkedType = linkedContent
    ? parseCustomerCenterContentType(linkedContent.content_type, "notice")
    : null;
  const boardLabel =
    linkedType != null ? BOARD_LABEL[linkedType][language === "en" ? "en" : "ko"] : "";
  const pushImage =
    typeof camp?.push_image_url === "string" && camp.push_image_url.trim()
      ? String(camp.push_image_url).trim()
      : "";
  const inAppImage =
    typeof camp?.in_app_image_url === "string" && camp.in_app_image_url.trim()
      ? String(camp.in_app_image_url).trim()
      : "";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← {t("admin_back_to_list")}
      </Link>

      {loading && !camp ? (
        <AdminLoadingState ko={lang === "ko"} label={t("common_loading")} />
      ) : camp ? (
        <>
          {/* 1. Linked content */}
          <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">
              {safeT("admin_notif_section_linked_content", {
                fallbackKo: "연결 원본",
                fallbackEn: "Linked original",
              })}
            </h2>
            {linkedEvent ? (
              <div className="space-y-2 rounded-ui-rect border border-sam-success bg-sam-success-soft/50 p-3">
                <div className="min-w-0 space-y-1">
                  <span className="inline-block rounded-ui-rect bg-sam-app px-1.5 py-0.5 text-[12px] font-medium text-sam-muted">
                    {language === "en" ? "Event" : "이벤트"}
                  </span>
                  <p className="break-words text-sm font-semibold text-sam-fg">{linkedEvent.title}</p>
                </div>
                <Link
                  href={`/admin/platform-events/${encodeURIComponent(linkedEvent.id)}`}
                  className="inline-block rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-medium text-signature"
                >
                  {safeT("admin_notif_btn_view_original", {
                    fallbackKo: "원본 보기",
                    fallbackEn: "View original",
                  })}
                </Link>
              </div>
            ) : linkedId && linkedContent ? (
              <div className="space-y-2 rounded-ui-rect border border-sam-warning bg-sam-warning-soft/60 p-3 dark:border-sam-warning dark:bg-sam-warning/20">
                <div className="flex flex-wrap items-start gap-3">
                  {linkedContent.hero_image_url ? (
                    <SamarketThumbnail
                      src={String(linkedContent.hero_image_url)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-ui-rect object-cover"
                      size={56}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="inline-block rounded-ui-rect bg-sam-app px-1.5 py-0.5 text-[12px] font-medium text-sam-muted">
                      {boardLabel}
                    </span>
                    <p className="break-words text-sm font-semibold text-sam-fg">{linkedContent.title}</p>
                    <p className="font-mono text-[12px] text-sam-meta">
                      {safeT("admin_notif_content_id_label", {
                        fallbackKo: "콘텐츠 ID",
                        fallbackEn: "Content ID",
                      })}
                      : {linkedContent.id}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/admin/app/notices/${encodeURIComponent(linkedContent.id)}`}
                  className="inline-block rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-medium text-signature"
                >
                  {safeT("admin_notif_btn_view_original", {
                    fallbackKo: "원본 보기",
                    fallbackEn: "View original",
                  })}
                </Link>
              </div>
            ) : isInboxDetailDestinationPayload(camp?.target_payload) ? (
              <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg" data-admin-notif-destination="inbox_detail">
                {language === "en"
                  ? "Destination: notification detail — members open this notification's own detail page."
                  : "목적지: 알림 내용 보기 — 회원이 알림을 누르면 이 알림의 상세 화면이 열립니다."}
              </p>
            ) : (
              <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-muted/10 px-3 py-2 text-sm text-sam-fg">
                {safeT("admin_notif_legacy_unbound_box", {
                  fallbackKo:
                    "이전 방식 · 원본 연결 없음. 공지/시스템 신규 발송은 원본 연결이 필요합니다. 기존 회원 알림은 읽기 호환만 유지됩니다.",
                  fallbackEn:
                    "Legacy · no linked source. Notice/system sends require a source. Existing member notifications remain read-compatible only.",
                })}
              </p>
            )}
          </section>

          {/* 2. Delivery copy + images */}
          <header className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-sam-muted">
                  {safeT("admin_notif_label_title", {
                    fallbackKo: "알림 제목",
                    fallbackEn: "Notification title",
                  })}
                </p>
                <h1 className="text-[16px] font-semibold text-sam-fg">{String(camp.title ?? "")}</h1>
              </div>
              <span className="rounded-ui-rect bg-sam-app px-2 py-1 text-xs text-sam-muted">
                {campaignStatusLabel(effectiveStatus || String(camp.status ?? ""), lang)}
                {typeof camp.archived_at === "string" && camp.archived_at ? ` · ${safeT("admin_campaign_cms_archived_badge", { fallbackKo: "보관됨", fallbackEn: "Archived" })}` : null}
              </span>
            </div>
            <div>
              <p className="text-xs text-sam-muted">
                {safeT("admin_notif_label_body", {
                  fallbackKo: "알림 메시지",
                  fallbackEn: "Notification message",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{String(camp.body ?? "")}</p>
            </div>
            {(pushImage || inAppImage) && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-sam-muted">
                  {safeT("admin_notif_detail_delivery_images", {
                    fallbackKo: "알림 이미지",
                    fallbackEn: "Delivery images",
                  })}
                </p>
                <div className="flex flex-wrap gap-4">
                  {pushImage ? (
                    <div className="space-y-1">
                      <p className="text-[12px] text-sam-muted">{t("admin_notif_label_push_image")}</p>
                      <SamarketThumbnail
                        src={pushImage}
                        alt=""
                        className="h-16 w-16 rounded-ui-rect object-cover"
                        size={64}
                      />
                    </div>
                  ) : null}
                  {inAppImage ? (
                    <div className="space-y-1">
                      <p className="text-[12px] text-sam-muted">{t("admin_notif_label_in_app_image")}</p>
                      <SamarketThumbnail
                        src={inAppImage}
                        alt=""
                        className="h-16 w-16 rounded-ui-rect object-cover"
                        size={64}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </header>

          {/* 3. Policy fields */}
          <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">
              {safeT("admin_notif_section_send_policy", {
                fallbackKo: "발송 정책",
                fallbackEn: "Send policy",
              })}
            </h2>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_type")}</span>{" "}
                {notifTypeLabel(t, String(camp.type ?? ""))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_channel")}</span>{" "}
                {notifChannelLabel(t, String(camp.channel ?? "push_and_in_app"))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_target")}</span>{" "}
                {notifTargetLabel(t, String(camp.target_type ?? ""))}
                {String(camp.target_type ?? "") === "selected_users" ? (
                  <span className="text-sam-muted">
                    {" "}
                    ({draftSelectedUserIds.length || Number(camp.target_count ?? 0)})
                  </span>
                ) : null}
              </p>
              {String(camp.target_type ?? "") === "selected_users" && draftSelectedUserIds.length ? (
                <p className="sm:col-span-2 break-all text-xs text-sam-muted">
                  {draftSelectedUserIds.join(", ")}
                </p>
              ) : null}
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_send_mode")}</span>{" "}
                {sendModeLabel(t, String(camp.send_mode ?? "immediate"))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_th_author")}</span>{" "}
                {authorName ?? (camp.created_by ? <AdminTechId id={String(camp.created_by)} /> : "—")}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_detail_created_at")}</span>{" "}
                {String(camp.created_at ?? "—")}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_detail_scheduled_at")}</span>{" "}
                {String(camp.scheduled_at ?? "—")}
              </p>
            </div>
            {camp.deeplink_url || camp.web_url ? (
              <p className="break-all text-xs text-signature">
                {camp.deeplink_url ? String(camp.deeplink_url) : null}
                {camp.deeplink_url && camp.web_url ? " · " : null}
                {camp.web_url ? String(camp.web_url) : null}
              </p>
            ) : null}
          </section>

          {err ? <p className="text-sm text-sam-danger">{err}</p> : null}

          {canSendDraft ? (
            <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <AdminActionButton variant="primary"
                disabled={busy || !sendAction.allowed}
                title={sendAction.reason ?? undefined}
                onClick={() => void openSendConfirm()}
              >
                {safeT("admin_notif_btn_send_draft", { fallbackKo: "발송하기", fallbackEn: "Send" })}
              </AdminActionButton>
              {!sendAction.allowed && sendAction.reason ? (
                <p className="text-xs text-sam-muted" data-admin-action-denied="1">
                  {lang === "ko" ? `발송 비활성: ${sendAction.reason}` : `Send disabled: ${sendAction.reason}`}
                </p>
              ) : null}
            </section>
          ) : null}

          <CampaignActionConfirmDialog
            action={sendConfirm ? "send" : null}
            facts={
              sendConfirm
                ? {
                    title: String(camp.title ?? ""),
                    targetCount: sendConfirm.audience.totalUsers,
                    pushEligibleCount: sendConfirm.audience.pushEligibleUsers,
                    channelLabel: channelText,
                    timeLabel: safeT("admin_campaign_cms_time_immediately", { fallbackKo: "즉시 발송", fallbackEn: "Immediately" }),
                  }
                : null
            }
            lang={lang}
            pending={busy}
            cancelLabel={t("common_cancel")}
            onCancel={() => setSendConfirm(null)}
            onConfirm={(reason) => void confirmSend(reason)}
          />
          <CampaignActionConfirmDialog
            action={pendingConfirm?.action ?? null}
            facts={pendingConfirm?.facts ?? null}
            lang={lang}
            pending={busy}
            cancelLabel={t("common_cancel")}
            onCancel={() => setPendingConfirm(null)}
            onConfirm={(reason) => void runConfirmed(reason)}
          />

          {/* ADM-03/04: lifecycle actions — each through a confirm dialog (대상 · 채널 · 시각) */}
          <section
            className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
            data-admin-notif-actions="1"
          >
            {can("edit") ? (
              <Link
                href={`/admin/notifications/create?edit=${encodeURIComponent(id)}`}
                className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm text-sam-fg"
              >
                {safeT("admin_campaign_cms_btn_edit", { fallbackKo: "수정", fallbackEn: "Edit" })}
              </Link>
            ) : null}
            {can("cancel") && String(camp.status ?? "") === "scheduled" ? (
              <AdminActionButton variant="danger" size="sm"
                disabled={busy}
                onClick={() =>
                  openConfirm(
                    "cancel",
                    factsFor(formatCampaignTime(queuedReal?.scheduled_for ?? (camp.scheduled_at as string | null))),
                    () => runLifecycleAction("cancel")
                  )
                }
              >
                {safeT("admin_campaign_cms_btn_cancel_reservation", { fallbackKo: "예약 취소", fallbackEn: "Cancel reservation" })}
              </AdminActionButton>
            ) : null}
            {can("stop_sending") ? (
              <AdminActionButton variant="danger" size="sm"
                disabled={busy}
                onClick={() => openConfirm("stop_sending", factsFor(nowLabel), () => runLifecycleAction("stop_sending"))}
              >
                {safeT("admin_campaign_cms_btn_stop_sending", { fallbackKo: "발송 중지", fallbackEn: "Stop sending" })}
              </AdminActionButton>
            ) : null}
            {can("pause") ? (
              <AdminActionButton variant="secondary" size="sm"
                disabled={busy}
                onClick={() =>
                  openConfirm(
                    "pause",
                    factsFor(queuedReal ? formatCampaignTime(queuedReal.scheduled_for) : nowLabel),
                    () => runLifecycleAction("pause")
                  )
                }
              >
                {safeT("admin_campaign_cms_btn_pause", { fallbackKo: "일시정지", fallbackEn: "Pause" })}
              </AdminActionButton>
            ) : null}
            {can("resume") ? (
              <AdminActionButton variant="secondary" size="sm"
                disabled={busy || !sendAction.allowed}
                title={sendAction.reason ?? undefined}
                onClick={() => openConfirm("resume", factsFor(nowLabel), () => runLifecycleAction("resume"))}
              >
                {safeT("admin_campaign_cms_btn_resume", { fallbackKo: "재개", fallbackEn: "Resume" })}
              </AdminActionButton>
            ) : null}
            {can("stop_recurring") ? (
              <AdminActionButton variant="danger" size="sm"
                disabled={busy}
                onClick={() =>
                  openConfirm("stop_recurring", factsFor(nowLabel), () => runLifecycleAction("stop_recurring"))
                }
              >
                {safeT("admin_campaign_cms_btn_stop_series", { fallbackKo: "반복 중지", fallbackEn: "Stop series" })}
              </AdminActionButton>
            ) : null}
            {can("resend") && failedReal ? (
              <AdminActionButton variant="secondary" size="sm"
                disabled={busy}
                onClick={() =>
                  openConfirm(
                    "resend",
                    factsFor(
                      safeT("admin_campaign_cms_time_immediately_resend", { fallbackKo: "즉시 재발송", fallbackEn: "Immediately" }),
                      failedReal.target_member_count ?? latestTargetCount
                    ),
                    (reason) => resendOccurrence(failedReal.id, reason)
                  )
                }
              >
                {safeT("admin_campaign_cms_btn_resend", { fallbackKo: "재발송", fallbackEn: "Resend" })}
              </AdminActionButton>
            ) : null}
            {can("duplicate") ? (
              <AdminActionButton variant="secondary" size="sm"
                disabled={busy}
                onClick={() => openConfirm("duplicate", factsFor("—"), () => runLifecycleAction("duplicate"))}
              >
                {safeT("admin_campaign_cms_btn_duplicate", { fallbackKo: "복제", fallbackEn: "Duplicate" })}
              </AdminActionButton>
            ) : null}
            {can("archive") ? (
              <AdminActionButton variant="secondary" size="sm"
                disabled={busy}
                onClick={() =>
                  openConfirm(
                    "archive",
                    factsFor(formatCampaignTime((camp.sent_at as string | null) ?? (camp.created_at as string | null))),
                    () => runLifecycleAction("archive")
                  )
                }
              >
                {safeT("admin_campaign_cms_btn_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
              </AdminActionButton>
            ) : null}
            {can("unarchive") ? (
              <AdminActionButton variant="secondary" size="sm"
                disabled={busy}
                onClick={() => openConfirm("unarchive", factsFor("—"), () => runLifecycleAction("unarchive"))}
              >
                {safeT("admin_campaign_cms_btn_unarchive", { fallbackKo: "보관 해제", fallbackEn: "Unarchive" })}
              </AdminActionButton>
            ) : null}
          </section>

          {isSending ? (
            <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3 text-sm dark:border-sam-warning dark:bg-sam-warning/30">
              <p className="font-medium text-sam-fg">{t("admin_notif_status_sending")}</p>
              <p className="mt-1 text-sam-muted">{t("admin_notif_sending_progress")}</p>
              <AdminActionButton variant="secondary" size="sm" className="mt-2"
                disabled={busy}
                onClick={() => void refresh()}
              >
                {adminCta("refresh", lang === "ko")}
              </AdminActionButton>
            </div>
          ) : null}

          {/* 4. Occurrence + summary */}
          {summary ? (
            <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-sm font-semibold text-sam-fg">{t("admin_notif_section_summary")}</h2>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-ui-rect bg-sam-app px-3 py-2">
                  {t("admin_notif_summary_push", {
                    sent: summary.push_sent ?? 0,
                    devices: summary.push_device_count ?? 0,
                    failed: summary.push_failed ?? 0,
                    skipped: summary.push_skipped ?? 0,
                  })}
                </p>
                <p className="rounded-ui-rect bg-sam-app px-3 py-2">
                  {t("admin_notif_summary_in_app", {
                    sent: summary.in_app_sent ?? 0,
                    members: summary.in_app_member_count ?? 0,
                    failed: summary.in_app_failed ?? 0,
                    skipped: summary.in_app_skipped ?? 0,
                  })}
                </p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2" data-admin-notif-delivery-columns="1">
                <p className="rounded-ui-rect bg-sam-app px-3 py-2">
                  <span className="text-sam-muted">{safeT("admin_campaign_cms_col_delivered", { fallbackKo: "발송 완료", fallbackEn: "Delivered" })}</span>{" "}
                  {safeT("admin_campaign_cms_push_in_app_counts", { fallbackKo: `푸시 ${summary.push_sent ?? 0} · 인앱 ${summary.in_app_sent ?? 0}`, fallbackEn: `Push ${summary.push_sent ?? 0} · In-app ${summary.in_app_sent ?? 0}`, vars: { push: `${summary.push_sent ?? 0}`, in_app: `${summary.in_app_sent ?? 0}` } })}
                </p>
                <p className="rounded-ui-rect bg-sam-app px-3 py-2">
                  <span className="text-sam-muted">{safeT("admin_campaign_cms_col_opened", { fallbackKo: "열람", fallbackEn: "Opened" })}</span>{" "}
                  {formatOpenedCounts(summary.opened)}
                </p>
              </div>
              <p className="text-xs text-sam-muted">
                {t("admin_notif_detail_target_count")}: {summary.target_member_count ?? 0} ·{" "}
                {t("admin_notif_audience_push_users", { count: summary.push_eligible_member_count ?? 0 })}
              </p>
            </section>
          ) : null}

          {summary && ((summary.push_failed ?? 0) > 0 || (summary.push_skipped ?? 0) > 0) && !isSending ? (
            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-notif-failures="1">
              <h2 className="text-sm font-semibold text-sam-fg">{lang === "en" ? "Why some pushes did not arrive" : "푸시가 안 간 이유"}</h2>
              {(summary.push_failed ?? 0) > 0 ? (
                failures ? (
                  <ul className="space-y-2 text-sm">
                    {failures.byReason.map((b) => (
                      <li key={b.reason} className="rounded-ui-rect bg-sam-app px-3 py-2">
                        <p className="font-medium text-sam-fg">
                          {pushFailureReasonLabel(b.reason, lang)} · {b.count}
                          {lang === "en" ? "" : "건"}
                        </p>
                        <p className="text-xs text-sam-muted">{pushFailureReasonHelp(b.reason, lang)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-sam-muted">{t("common_loading")}</p>
                )
              ) : null}
              {(summary.push_skipped ?? 0) > 0 ? (
                <p className="rounded-ui-rect bg-sam-app px-3 py-2 text-sm text-sam-fg">
                  {lang === "en"
                    ? `Skipped ${summary.push_skipped}: members with no active phone or push turned off (they still got it in the inbox).`
                    : `건너뜀 ${summary.push_skipped}명 — 앱이 설치된 폰이 없거나 푸시를 끈 회원입니다 (알림함에는 들어갔습니다).`}
                </p>
              ) : null}
              {failures && failures.devices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-sam-muted">
                      <tr>
                        <th className="py-1 pr-3">{lang === "en" ? "Reason" : "원인"}</th>
                        <th className="py-1 pr-3">{lang === "en" ? "Platform" : "기기"}</th>
                        <th className="py-1 pr-3">{lang === "en" ? "App version" : "앱 버전"}</th>
                        <th className="py-1 pr-3">{lang === "en" ? "Last seen" : "마지막 접속"}</th>
                        <th className="py-1 pr-3">{lang === "en" ? "Device now" : "현재 기기 상태"}</th>
                        <th className="py-1">{lang === "en" ? "Provider response" : "FCM·APNs 응답"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.devices.map((d, i) => (
                        <tr key={i} className="border-t border-sam-border-soft">
                          <td className="py-1 pr-3">{pushFailureReasonLabel(d.reason, lang)}</td>
                          <td className="py-1 pr-3">{d.platform ?? "—"}</td>
                          <td className="py-1 pr-3">{d.app_version ?? "—"}</td>
                          <td className="py-1 pr-3">{d.last_seen_at ? formatAdminManilaDateTime(d.last_seen_at) : "—"}</td>
                          <td className="py-1 pr-3">
                            {d.is_active === false
                              ? lang === "en"
                                ? "Turned off (excluded next time)"
                                : "꺼짐 (다음 발송부터 제외)"
                              : d.is_active
                                ? lang === "en"
                                  ? "Active"
                                  : "사용 중"
                                : "—"}
                          </td>
                          <td className="py-1 break-all text-sam-muted">
                            {d.provider ? `${d.provider} · ` : ""}
                            {d.detail || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_notif_section_occurrences")}</h2>
            {occurrences.length === 0 ? (
              <p className="mt-2 text-xs text-sam-muted">{t("admin_notif_detail_no_delivery_log")}</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-sam-muted">
                    <tr>
                      <th className="py-1 pr-3">{t("admin_occurrence_th_sequence")}</th>
                      <th className="py-1 pr-3">{t("admin_occurrence_th_trigger")}</th>
                      <th className="py-1 pr-3">{t("admin_notif_label_status")}</th>
                      <th className="py-1 pr-3">{t("admin_notif_detail_scheduled_at")}</th>
                      <th className="py-1 pr-3">{safeT("admin_campaign_cms_col_delivered", { fallbackKo: "발송 완료", fallbackEn: "Delivered" })}</th>
                      <th className="py-1 pr-3">{safeT("admin_campaign_cms_col_opened", { fallbackKo: "열람", fallbackEn: "Opened" })}</th>
                      <th className="py-1 pr-3">{safeT("admin_campaign_cms_col_note", { fallbackKo: "비고", fallbackEn: "Note" })}</th>
                      <th className="py-1">{t("admin_points_th_work")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occurrences.map((row) => (
                      <tr key={row.id} className="border-t border-sam-border-soft">
                        <td className="py-1 pr-3 tabular-nums">{row.sequence_number}</td>
                        <td className="py-1 pr-3">{row.trigger_type}</td>
                        <td className="py-1 pr-3">
                          {row.status === "queued"
                            ? t("admin_notif_status_queued")
                            : notifStatusLabel(t, row.status)}
                        </td>
                        <td className="py-1 pr-3">{row.scheduled_for ? formatCampaignTime(row.scheduled_for) : "—"}</td>
                        <td className="py-1 pr-3">
                          {t("admin_notif_result_metrics", {
                            pushSent: row.push_sent ?? 0,
                            pushTotal: row.push_device_count ?? 0,
                            inAppSent: row.in_app_sent ?? 0,
                            inAppTotal: row.in_app_member_count ?? 0,
                          })}
                        </td>
                        <td className="py-1 pr-3">{formatOpenedCounts(row.opened)}</td>
                        <td className="py-1 pr-3 break-all text-sam-muted">{row.last_error ?? "—"}</td>
                        <td className="py-1">
                          {row.status === "queued" && row.trigger_type !== "test" ? (
                            <AdminActionButton variant="ghost" size="sm"
                              disabled={busy}
                              onClick={() =>
                                openConfirm(
                                  String(camp.send_mode ?? "") === "recurring" ? "cancel_occurrence" : "cancel",
                                  factsFor(
                                    row.scheduled_for ? formatCampaignTime(row.scheduled_for) : nowLabel,
                                    row.target_member_count ?? latestTargetCount
                                  ),
                                  () => cancelOccurrence(row.id)
                                )
                              }
                            >
                              {t("admin_notif_btn_cancel_occurrence")}
                            </AdminActionButton>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Audit log (admin_notification_campaign_audit_logs) */}
          <details className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-admin-notif-audit="1">
            <summary className="cursor-pointer text-sm font-medium text-sam-fg">
              {safeT("admin_campaign_cms_audit_title", { fallbackKo: "변경 이력", fallbackEn: "Change history" })}
            </summary>
            {!auditSupported ? (
              <p className="mt-2 text-xs text-sam-muted">
                {safeT("admin_campaign_cms_audit_needs_migration", { fallbackKo: "감사 로그 마이그레이션 적용 후 표시됩니다.", fallbackEn: "Available after the audit-log migration is applied." })}
              </p>
            ) : auditLogs.length === 0 ? (
              <p className="mt-2 text-xs text-sam-muted">—</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-sam-fg">
                {auditLogs.map((log) => (
                  <li key={log.id} className="flex flex-wrap gap-x-2">
                    <span className="tabular-nums text-sam-muted">{formatCampaignTime(log.created_at)}</span>
                    <span className="font-medium">{log.action}</span>
                    {log.from_status || log.to_status ? (
                      <span className="text-sam-muted">
                        {log.from_status ? campaignStatusLabel(log.from_status, lang) : "—"} →{" "}
                        {log.to_status ? campaignStatusLabel(log.to_status, lang) : "—"}
                      </span>
                    ) : null}
                    {typeof log.target_count === "number" ? (
                      <span className="text-sam-muted">
                        {safeT("admin_campaign_cms_audit_audience_count", {
                          fallbackKo: `대상 ${log.target_count}명`,
                          fallbackEn: `audience ${log.target_count}`,
                          vars: { count: log.target_count },
                        })}
                      </span>
                    ) : null}
                    <span className="font-mono text-sam-meta">
                      {log.actor_id ? <AdminTechId id={log.actor_id} /> : safeT("admin_campaign_cms_audit_actor_system", { fallbackKo: "시스템", fallbackEn: "system" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {/* 5. Device log */}
          <details className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <summary className="cursor-pointer text-sm font-medium text-sam-fg">
              {t("admin_notif_detail_delivery_log")} (device)
            </summary>
            {deviceDeliveryLog.length === 0 ? (
              <p className="mt-2 text-xs text-sam-muted">{t("admin_notif_detail_no_delivery_log")}</p>
            ) : (
              <div className="mt-2 max-h-72 overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-sam-muted">
                    <tr>
                      <th className="py-1 pr-3">userId</th>
                      <th className="py-1 pr-3">channel</th>
                      <th className="py-1 pr-3">{t("admin_notif_label_status")}</th>
                      <th className="py-1">time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceDeliveryLog.map((row, idx) => (
                      <tr key={`${row.userId}-${row.channel}-${idx}`} className="border-t border-sam-border-soft">
                        <td className="py-1 pr-3 font-mono"><AdminTechId id={row.userId} /></td>
                        <td className="py-1 pr-3">{row.channel}</td>
                        <td className="py-1 pr-3">
                          <AdminStatusLabel namespace={NOTIFICATIONS_PUSH_DELIVERY_STATUS_NS} code={row.status} ko={lang === "ko"} />
                        </td>
                        <td className="py-1">{row.sentAt ?? row.updatedAt ?? row.skipReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        </>
      ) : loadErr && loadErr.httpStatus !== 404 ? (
        <AdminErrorState
          ko={lang === "ko"}
          code={loadErr.code}
          httpStatus={loadErr.httpStatus}
          onRetry={() => void refresh()}
        />
      ) : (
        <AdminEmptyState ko={lang === "ko"} message={t("admin_notif_not_found")} />
      )}
    </div>
  );
}
