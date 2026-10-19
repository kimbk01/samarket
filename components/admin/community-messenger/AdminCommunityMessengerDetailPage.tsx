"use client";

import { dibayAlert, dibayPrompt, DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { CommunityMessengerCallForceEndReasonCode } from "@/lib/admin-community-messenger/call-force-end-reasons";
import type { AdminCommunityMessengerRoomDetail } from "@/lib/admin-community-messenger/service";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { useCmAdminLabels } from "./useCmAdminLabels";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminErrorState, AdminForbiddenState, isAdminForbiddenCode } from "@/components/admin/ui/AdminStateViews";
import Link from "next/link";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import { adminUserDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import { confirmAdminAction, ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/operator-ux/admin-confirm-action";
import {
  CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
  CHAT_ADMIN_REASON_QUERY_PARAM,
  type ChatAdminContentBasis,
  type ChatAdminContentDenial,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminCmMessageBody, AdminCmMessageKindBadge } from "@/components/admin/chats/AdminCmMessageBody";
import { useAdminOlderMessages } from "@/components/admin/chats/use-admin-older-messages";
import { useAdminLocationReturnTo } from "@/components/admin/chats/use-admin-location-return-to";
import { AdminCmRoomDomainLinksCard } from "./AdminCmRoomDomainLinksCard";

type CmMessageItem = AdminCommunityMessengerRoomDetail["messages"][number];

/** R1-A: 서버가 본문 열람 판정을 함께 내려준다 (본문 열람 감사는 이 GET 내부에서 서버가 기록). */
type ContentAccess =
  | { granted: true; basis: ChatAdminContentBasis; ghost: boolean; domain: string }
  | { granted: false; denial: ChatAdminContentDenial; ghost: true; domain: string; reasonMinLength?: number };
type DetailResponse = AdminCommunityMessengerRoomDetail & {
  ok?: boolean;
  error?: string;
  contentAccess?: ContentAccess;
};

const CONTENT_BASIS_KEYS: Record<ChatAdminContentBasis, MessageKey> = {
  linked_report: "admin_chat_r1_content_basis_linked_report",
  linked_trade: "admin_chat_r1_content_basis_linked_trade",
  linked_store_order: "admin_chat_r1_content_basis_linked_store_order",
  ghost: "admin_chat_r1_content_basis_ghost",
};
type RoomAction =
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";
type CallAction = "force_end";
type MessageAction = "hide_message" | "unhide_message";
type ReportAction =
  | "reviewing"
  | "resolved"
  | "rejected"
  | "sanction_message_hide"
  | "sanction_room_block";
type PendingForceEndCall = NonNullable<AdminCommunityMessengerRoomDetail["activeCalls"]>[number];

export function AdminCommunityMessengerDetailPage({ roomId }: { roomId: string }) {
  const { t, formatDateTime, roomTypeLabel, forceEndReasonOptions, forceEndReasonLabel } = useCmAdminLabels();
  const { language } = useI18n();
  const ko = language !== "en";
  const [detail, setDetail] = useState<AdminCommunityMessengerRoomDetail | null>(null);
  const [contentAccess, setContentAccess] = useState<ContentAccess | null>(null);
  const [forbiddenCode, setForbiddenCode] = useState<string | null>(null);
  /** 고스트 열람 사유 — 서버 GET 에 `?reason=` 으로 전달 (서버가 검증·감사). */
  const viewReasonRef = useRef("");
  const [loading, setLoading] = useState(true);
  /** C-10: 불러오기 실패(네트워크·서버) ≠ 「방 없음」(404). */
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** 신고·상태 조치 중복 클릭 방지 (상태 갱신 전 연속 클릭). */
  const actionLockRef = useRef(false);
  const [note, setNote] = useState("");
  const [forceEndReasonCode, setForceEndReasonCode] = useState<CommunityMessengerCallForceEndReasonCode | "">("");
  const [pendingForceEndCall, setPendingForceEndCall] = useState<PendingForceEndCall | null>(null);
  const [callStatusFilter, setCallStatusFilter] = useState<
    "missed" | "rejected" | "cancelled" | "ended" | "incoming" | "dialing" | ""
  >("");
  const [callKindFilter, setCallKindFilter] = useState<"voice" | "video" | "">("");
  const [activeCallStatusFilter, setActiveCallStatusFilter] = useState<"ringing" | "active" | "">("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditPeriodFilter, setAuditPeriodFilter] = useState<"24h" | "7d" | "30d" | "">("");
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const reason = viewReasonRef.current;
      const qs = reason ? `?${CHAT_ADMIN_REASON_QUERY_PARAM}=${encodeURIComponent(reason)}` : "";
      const res = await fetch(`/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}${qs}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as DetailResponse;
      if (res.ok && json.ok) {
        setForbiddenCode(null);
        setLoadError(null);
        setDetail(json);
        setContentAccess(json.contentAccess ?? null);
      } else if (!silent) {
        const forbidden = isAdminForbiddenCode(json.error, res.status);
        setForbiddenCode(forbidden ? (json.error ?? "forbidden") : null);
        setLoadError(forbidden || res.status === 404 ? null : { code: json.error || "load_failed", status: res.status });
        setDetail(null);
        setContentAccess(null);
      }
    } catch {
      if (!silent) setLoadError({ code: "network_error" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // R1-B C-6: 최신 페이지 + id 커서 「이전 메시지 더 보기」 (본문 열람 판정은 서버가 같은 정책으로 다시 한다)
  const fetchOlderCm = useCallback(
    async (beforeId: string) => {
      const qs = new URLSearchParams({ before: beforeId, limit: "80" });
      if (viewReasonRef.current) qs.set(CHAT_ADMIN_REASON_QUERY_PARAM, viewReasonRef.current);
      const res = await fetch(
        `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/messages?${qs.toString()}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; messages?: CmMessageItem[]; hasMore?: boolean };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "load_failed");
      return { items: json.messages ?? [], hasMore: json.hasMore === true };
    },
    [roomId]
  );
  const contentGranted = contentAccess?.granted !== false;
  const olderMsgs = useAdminOlderMessages<CmMessageItem>({
    resetKey: roomId,
    latest: contentGranted ? (detail?.messages ?? []) : [],
    latestHasMore: contentGranted && detail?.messagesHasMore === true,
    fetchOlder: fetchOlderCm,
  });
  const { patchOlder } = olderMsgs;
  const returnCtx = useAdminLocationReturnTo();

  // R1-A: 본문 열람 감사는 서버 GET 내부에서 기록한다 — 클라이언트 ghost enter/exit 호출에 의존하지 않는다.
  const unlockContent = useCallback(async () => {
    const raw = await dibayPrompt({
      title: t("admin_chat_r1_content_reason_prompt_title"),
      description: t("admin_chat_r1_content_reason_prompt_desc"),
      placeholder: t("admin_chat_r1_content_reason_placeholder"),
      confirmLabel: t("admin_chat_r1_content_unlock_cta"),
      cancelLabel: ko ? "취소" : "Cancel",
      required: true,
    });
    if (raw === null) return;
    const reason = raw.trim();
    if (reason.length < CHAT_ADMIN_GHOST_REASON_MIN_LENGTH) {
      await dibayAlert({ title: t("admin_chat_r1_content_reason_too_short") });
      return;
    }
    viewReasonRef.current = reason;
    await refresh();
  }, [ko, refresh, t]);

  /** 조치 사유 — 운영 메모가 2자 이상이면 그대로, 아니면 L2 확인(사유 입력). */
  const resolveActionReason = useCallback(
    async (title: string): Promise<string | null> => {
      const typed = note.trim();
      if (typed.length >= ADMIN_REASON_MIN_LENGTH) {
        // C-5: 운영 메모가 사유로 쓰여도 상태 조치는 확인 팝업을 거친다 (L1).
        const ok = await confirmAdminAction({
          level: "L1",
          ko,
          title,
          description: ko ? `사유: ${typed}` : `Reason: ${typed}`,
          confirmLabel: t("admin_chat_r1_action_confirm_cta"),
        });
        return ok.ok ? typed : null;
      }
      const c = await confirmAdminAction({
        level: "L2",
        ko,
        title,
        confirmLabel: t("admin_chat_r1_action_confirm_cta"),
      });
      return c.ok ? c.reason : null;
    },
    [ko, note, t]
  );

  const actionErrorTitle = useCallback(
    (error: string | undefined, fallback: string) =>
      error === "stale_state"
        ? t("admin_chat_r1_stale_state")
        : error === "reason_required"
          ? t("admin_chat_r1_reason_required")
          : (error ?? fallback),
    [t]
  );

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        void refresh(true);
      }, 300);
    };

    const channel: RealtimeChannel = sb
      .channel(`admin-community-messenger-room:${roomId}`, messengerPrivateBroadcastChannelOptions())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_rooms", filter: `id=eq.${roomId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_participants", filter: `room_id=eq.${roomId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_messages", filter: `room_id=eq.${roomId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_call_logs", filter: `room_id=eq.${roomId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_call_sessions", filter: `room_id=eq.${roomId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_session_participants",
          filter: `room_id=eq.${roomId}`,
        },
        scheduleRefresh
      )
      .on(
        // C-20: audit_logs 전체가 아니라 이 방을 대상으로 한 기록만 (통화 세션 기록은 call_sessions 구독이 갱신).
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs", filter: `target_id=eq.${roomId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_reports", filter: `room_id=eq.${roomId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [refresh, roomId]);

  const runAction = useCallback(
    async (action: RoomAction) => {
      const reason = await resolveActionReason(t("admin_chat_r1_action_confirm_title"));
      if (!reason) return;
      setBusy(action);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/action`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, reason }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: actionErrorTitle(json.error, t("admin_cm_err_action_failed")) });
          if (json.error === "stale_state") await refresh();
          return;
        }
        setNote("");
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [actionErrorTitle, refresh, resolveActionReason, roomId, t]
  );

  const runMessageAction = useCallback(
    async (messageId: string, hidden: boolean) => {
      const reason = await resolveActionReason(
        hidden ? t("admin_cm_action_hide_message") : t("admin_cm_action_unhide_message")
      );
      if (!reason) return;
      const key = `${hidden ? "hide" : "unhide"}:${messageId}`;
      setBusy(key);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hidden, reason }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: actionErrorTitle(json.error, t("admin_cm_err_message_action_failed")) });
          if (json.error === "stale_state") await refresh();
          return;
        }
        patchOlder(messageId, { isHiddenByAdmin: hidden });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [actionErrorTitle, patchOlder, refresh, resolveActionReason, roomId, t]
  );

  const runCallAction = useCallback(
    async (sessionId: string, action: CallAction) => {
      const key = `call:${sessionId}:${action}`;
      setBusy(key);
      try {
        const res = await fetch(`/api/admin/community-messenger/calls/${encodeURIComponent(sessionId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reasonCode: forceEndReasonCode, adminNote: note }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: json.error === "admin_note_required"
              ? t("admin_cm_err_force_end_note_required")
              : json.error === "reason_code_required"
                ? t("admin_cm_err_force_end_reason_required")
                : (json.error ?? t("admin_cm_err_call_action_failed")) });
          return;
        }
        setForceEndReasonCode("");
        setNote("");
        setPendingForceEndCall(null);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [forceEndReasonCode, note, refresh, t]
  );

  const openForceEndConfirm = useCallback(
    async (call: PendingForceEndCall) => {
      if (!forceEndReasonCode) {
        await dibayAlert({ title: t("admin_cm_err_force_end_reason_required") });
        return;
      }
      if (!note.trim()) {
        await dibayAlert({ title: t("admin_cm_err_force_end_note_input_required") });
        return;
      }
      setPendingForceEndCall(call);
    },
    [forceEndReasonCode, note, t]
  );

  const runReportAction = useCallback(
    async (reportId: string, action: ReportAction) => {
      if (actionLockRef.current) return;
      const reason = await resolveActionReason(t("admin_chat_r1_action_confirm_title"));
      if (!reason) return;
      if (actionLockRef.current) return;
      actionLockRef.current = true;
      const key = `report:${reportId}:${action}`;
      setBusy(key);
      try {
        const res = await fetch(`/api/admin/community-messenger/reports/${encodeURIComponent(reportId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: actionErrorTitle(json.error, t("admin_cm_err_report_failed")) });
          if (json.error === "stale_state") await refresh();
          return;
        }
        emitAdminQueueChanged("messenger_actionable");
        await refresh();
      } finally {
        actionLockRef.current = false;
        setBusy(null);
      }
    },
    [actionErrorTitle, refresh, resolveActionReason, t]
  );

  const filteredCalls = useMemo(() => {
    const calls = detail?.calls ?? [];
    return calls.filter((call) => {
      if (callStatusFilter && call.status !== callStatusFilter) return false;
      if (callKindFilter && call.callKind !== callKindFilter) return false;
      return true;
    });
  }, [callKindFilter, callStatusFilter, detail?.calls]);

  const filteredActiveCalls = useMemo(() => {
    const activeCalls = detail?.activeCalls ?? [];
    return activeCalls.filter((call) => {
      if (activeCallStatusFilter && call.status !== activeCallStatusFilter) return false;
      if (callKindFilter && call.callKind !== callKindFilter) return false;
      return true;
    });
  }, [activeCallStatusFilter, callKindFilter, detail?.activeCalls]);

  const filteredCallAudits = useMemo(() => {
    const callAudits = detail?.callAudits ?? [];
    const keyword = auditQuery.trim().toLowerCase();
    return callAudits.filter((log) => {
      if (!matchesAuditPeriod(log.createdAt, auditPeriodFilter)) return false;
      if (!keyword) return true;
      const haystack = [
        log.actorLabel,
        log.reasonCode,
        log.reasonLabel,
        log.note,
        log.sessionId,
        log.action,
        log.beforeStatus,
        log.afterStatus,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [auditPeriodFilter, auditQuery, detail?.callAudits]);

  if (loading) {
    return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</div>;
  }

  if (forbiddenCode) {
    return <AdminForbiddenState ko={ko} code={forbiddenCode} />;
  }

  if (loadError) {
    return <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void refresh()} />;
  }

  if (!detail) {
    return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_not_found")}</div>;
  }

  const room = detail.room;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_cm_page_detail_title"
        backHref={returnCtx.returnTo ?? "/admin/chats/messenger"}
        descriptionKey="admin_cm_page_detail_desc"
      />

      <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="sam-text-body font-semibold text-amber-900">{t("admin_chat_r1_ghost_banner_title")}</p>
        <p className="mt-1 sam-text-helper text-amber-800">{t("admin_chat_r1_ghost_banner_body")}</p>
        {contentAccess?.granted ? (
          <p className="mt-1 sam-text-helper font-medium text-amber-900">{t(CONTENT_BASIS_KEYS[contentAccess.basis])}</p>
        ) : null}
      </div>

      <AdminCard titleKey="admin_cm_card_room_info">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label={t("admin_cm_label_room_title")} value={room.title} />
          <Info label={t("admin_cm_label_room_id")} value={room.id} mono />
          <Info
            label={t("admin_cm_th_type")}
            value={roomTypeLabel(room.roomType === "open_group" ? "open_group" : room.roomType === "private_group" ? "private_group" : "direct")}
          />
          <Info label={t("admin_cm_th_status")} value={adminChatLabel("room_status", room.roomStatus, ko).label} />
          <Info label={t("admin_cm_label_visibility")} value={room.visibility === "public" ? (ko ? "공개" : "Public") : ko ? "비공개" : "Private"} />
          <Info
            label={t("admin_cm_label_join_policy")}
            value={room.joinPolicy === "password" ? (ko ? "비밀번호 입장" : "Password") : ko ? "초대 전용" : "Invite only"}
          />
          <Info label={t("admin_cm_label_readonly")} value={room.isReadonly ? t("admin_cm_common_on") : t("admin_cm_common_off")} />
          <Info label={t("admin_cm_th_creator")} value={room.createdByLabel} />
          <Info label={t("admin_cm_label_owner")} value={room.ownerLabel} />
          <Info label={t("admin_cm_label_member_count")} value={t("admin_cm_common_members", { count: room.memberCount })} />
          <Info label={t("admin_cm_label_member_limit")} value={room.memberLimit ? t("admin_cm_common_members", { count: room.memberLimit }) : t("admin_cm_common_dash")} />
          <Info label={t("admin_cm_label_discoverable")} value={room.isDiscoverable ? t("admin_cm_common_on") : t("admin_cm_common_off")} />
          <Info label={t("admin_cm_label_password")} value={room.requiresPassword ? t("admin_cm_common_configured") : t("admin_cm_common_not_set")} />
          <Info label={t("admin_cm_label_last_message_at")} value={formatDateTime(room.lastMessageAt)} />
          <Info label={t("admin_cm_label_summary")} value={room.summary || t("admin_cm_common_dash")} full />
          <Info label={t("admin_cm_th_last_message")} value={room.lastMessage} full />
          <Info label={t("admin_cm_label_ops_note")} value={room.adminNote || t("admin_cm_common_dash")} full />
          <Info label={t("admin_cm_label_last_moderator")} value={room.moderatedByLabel} />
          <Info label={t("admin_cm_label_last_moderated_at")} value={room.moderatedAt ? formatDateTime(room.moderatedAt) : t("admin_cm_common_dash")} />
        </div>
      </AdminCard>

      <AdminCmRoomDomainLinksCard domainRef={detail.domainRef} here={returnCtx.here} />

      <AdminCard titleKey="admin_cm_ghost_audits_title">
        {(detail.ghostAudits?.length ?? 0) === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("admin_cm_ghost_audits_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {(detail.ghostAudits ?? []).slice(0, 20).map((row) => (
              <li key={row.id} className="rounded border border-sam-border-soft px-3 py-2 sam-text-helper text-sam-fg">
                <span className="font-semibold">
                  {row.action === "chat_room.content_view"
                    ? t("admin_chat_r1_ghost_action_view")
                    : row.action.includes("enter")
                      ? t("admin_cm_ghost_action_enter")
                      : t("admin_cm_ghost_action_exit")}
                </span>
                {" · "}
                {formatDateTime(row.createdAt)}
                {row.actorId ? ` · ${row.actorId.slice(0, 8)}` : ""}
                {row.reason ? ` · ${row.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_ops_actions">
        <div className="space-y-3">
          <select
            value={forceEndReasonCode}
            onChange={(e) => setForceEndReasonCode(e.target.value as CommunityMessengerCallForceEndReasonCode | "")}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_select_force_end_reason")}</option>
            {forceEndReasonOptions.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("admin_cm_placeholder_ops_note")}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <p className="sam-text-helper text-amber-700">{t("admin_cm_force_end_requires_note")}</p>
          <div className="flex flex-wrap gap-2">
            {room.roomStatus !== "blocked" ? (
              <ActionButton busy={busy} action="block_room" label={t("admin_cm_action_block_chat")} onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="unblock_room" label={t("admin_cm_action_unblock_chat")} onRun={runAction} />
            )}
            {room.roomStatus !== "archived" ? (
              <ActionButton busy={busy} action="archive_room" label={t("admin_cm_action_archive")} onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="unarchive_room" label={t("admin_cm_action_unarchive")} onRun={runAction} />
            )}
            {!room.isReadonly ? (
              <ActionButton busy={busy} action="readonly_on" label={t("admin_cm_action_readonly_on")} onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="readonly_off" label={t("admin_cm_action_readonly_off")} onRun={runAction} />
            )}
          </div>
        </div>
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard titleKey="admin_cm_card_participants">
          <div className="space-y-2">
            {detail.participants.map((participant) => (
              <div key={participant.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="sam-text-body font-medium text-sam-fg">
                      {participant.userId ? (
                        <Link href={adminUserDetailHref(participant.userId, returnCtx.here)} className="text-signature underline">
                          {participant.label}
                        </Link>
                      ) : (
                        participant.label
                      )}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">
                      {adminChatLabel("participant_role", participant.role, ko).label} ·{" "}
                      {ko ? `안 읽음 ${participant.unreadCount}` : `Unread ${participant.unreadCount}`}
                    </p>
                  </div>
                  <div className="text-right sam-text-helper text-sam-meta">
                    <div>{t("admin_cm_common_joined", { date: participant.joinedAt ? formatDateTime(participant.joinedAt) : t("admin_cm_common_dash") })}</div>
                    <div className="mt-1">{t("admin_cm_common_read", { date: participant.lastReadAt ? formatDateTime(participant.lastReadAt) : t("admin_cm_common_dash") })}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard titleKey="admin_cm_card_recent_calls_detail">
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={callStatusFilter}
              onChange={(e) =>
                setCallStatusFilter(
                  e.target.value as "missed" | "rejected" | "cancelled" | "ended" | "incoming" | "dialing" | ""
                )
              }
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">{t("admin_cm_filter_all_record_status")}</option>
              <option value="missed">missed</option>
              <option value="rejected">rejected</option>
              <option value="cancelled">cancelled</option>
              <option value="ended">ended</option>
              <option value="incoming">incoming</option>
              <option value="dialing">dialing</option>
            </select>
            <select
              value={callKindFilter}
              onChange={(e) => setCallKindFilter(e.target.value as "voice" | "video" | "")}
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">{t("admin_cm_filter_all_call_kind")}</option>
              <option value="voice">voice</option>
              <option value="video">video</option>
            </select>
          </div>
          <div className="space-y-2">
            {filteredCalls.length === 0 ? (
              <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_call_logs")}</div>
            ) : (
              filteredCalls.map((call) => (
                <div key={call.id} className="rounded border border-sam-border-soft px-3 py-3">
                  <p className="sam-text-body font-medium text-sam-fg">
                    {call.callerLabel} {"->"} {call.peerLabel}
                  </p>
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    {t("admin_cm_common_call_duration", {
                      kind: call.callKind,
                      status: call.status,
                      seconds: call.durationSeconds,
                      count: 0,
                    }).replace(" · 참여 0명", "").replace(" · 0 participants", "").replace(" · 参与 0人", "")}
                  </p>
                  <p className="mt-1 sam-text-helper text-sam-meta">{formatDateTime(call.startedAt)}</p>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard titleKey="admin_cm_card_active_calls">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={activeCallStatusFilter}
            onChange={(e) => setActiveCallStatusFilter(e.target.value as "ringing" | "active" | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_filter_all_active_status")}</option>
            <option value="ringing">ringing</option>
            <option value="active">active</option>
          </select>
          <select
            value={callKindFilter}
            onChange={(e) => setCallKindFilter(e.target.value as "voice" | "video" | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_filter_all_call_kind")}</option>
            <option value="voice">voice</option>
            <option value="video">video</option>
          </select>
        </div>
        <div className="space-y-2">
          {filteredActiveCalls.length === 0 ? (
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_active_calls_detail")}</div>
          ) : (
            filteredActiveCalls.map((call) => (
              <div key={call.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="sam-text-body font-medium text-sam-fg">
                      {call.sessionMode === "group" ? t("admin_cm_call_group") : t("admin_cm_call_direct")} · {call.callKind}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">
                      {t("admin_cm_common_call_status_line", { status: call.status, initiator: call.initiatorLabel, started: formatDateTime(call.startedAt) })}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-fg">
                      {t("admin_cm_common_participants_joined", { joined: call.joinedCount, invited: call.invitedCount, total: call.participantCount })}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">
                      {call.participants.map((participant) => `${participant.label}(${participant.status})`).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === `call:${call.id}:force_end`}
                    onClick={() => void openForceEndConfirm(call)}
                    className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-helper font-medium text-red-700"
                  >
                    {busy === `call:${call.id}:force_end` ? t("admin_cm_common_ending") : t("admin_cm_action_force_end")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_force_end_audit">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder={t("admin_cm_placeholder_audit_search_detail")}
            className="min-w-[220px] rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <select
            value={auditPeriodFilter}
            onChange={(e) => setAuditPeriodFilter(e.target.value as "24h" | "7d" | "30d" | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_period_all")}</option>
            <option value="24h">{t("admin_cm_period_24h")}</option>
            <option value="7d">{t("admin_cm_period_7d")}</option>
            <option value="30d">{t("admin_cm_period_30d")}</option>
          </select>
          <div className="flex items-center sam-text-helper text-sam-muted">{t("admin_cm_common_results", { count: filteredCallAudits.length })}</div>
        </div>
        <div className="space-y-2">
          {filteredCallAudits.length === 0 ? (
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_audit_logs")}</div>
          ) : (
            filteredCallAudits.map((log) => (
              <div key={log.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="sam-text-body font-medium text-sam-fg">
                      {t("admin_cm_common_admin_actor", { name: log.actorLabel })}
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 sam-text-xxs text-red-700">{t("admin_cm_force_end_badge")}</span>
                    </p>
                    <p className="mt-1 font-mono sam-text-helper text-sam-muted">{log.sessionId}</p>
                    {log.reasonCode ? (
                      <p className="mt-1 sam-text-helper text-sky-700">
                        {t("admin_cm_common_reason_code", { label: log.reasonLabel, code: log.reasonCode ?? "" })}
                      </p>
                    ) : null}
                    <p className="mt-1 sam-text-helper text-sam-fg">
                      {t("admin_cm_common_status", { status: `${log.beforeStatus} -> ${log.afterStatus}` })}
                    </p>
                    {log.note ? <p className="mt-1 sam-text-helper text-amber-700">{t("admin_cm_common_note", { text: log.note })}</p> : null}
                  </div>
                  <div className="sam-text-helper text-sam-meta">{formatDateTime(log.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_message_timeline">
        <div className="space-y-2">
          {contentAccess && !contentAccess.granted ? (
            <div
              data-admin-chat-content-locked={contentAccess.denial}
              className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-4 sam-text-body text-amber-950"
            >
              <p className="font-medium">{t("admin_chat_r1_content_locked_title")}</p>
              <p className="mt-1 sam-text-helper">
                {contentAccess.denial === "super_admin_only"
                  ? t("admin_chat_r1_content_locked_super_admin")
                  : t("admin_chat_r1_content_locked_reason")}
              </p>
              {contentAccess.denial === "ghost_reason_required" ? (
                <button
                  type="button"
                  onClick={() => void unlockContent()}
                  className="mt-3 rounded-ui-rect border border-amber-400 bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-amber-900"
                >
                  {t("admin_chat_r1_content_unlock_cta")}
                </button>
              ) : null}
            </div>
          ) : null}
          {olderMsgs.hasMore ? (
            <div className="flex flex-col items-center gap-1 py-1">
              <button
                type="button"
                disabled={olderMsgs.loading}
                onClick={() => void olderMsgs.loadOlder()}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50"
              >
                {olderMsgs.loading ? t("admin_chat_r1b_loading_older") : t("admin_chat_r1b_load_older")}
              </button>
              {olderMsgs.error ? <p className="sam-text-xxs text-red-700">{t("admin_chat_r1b_load_older_failed")}</p> : null}
            </div>
          ) : null}
          {olderMsgs.messages.map((message) => (
            <div key={message.id} className="rounded border border-sam-border-soft px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="sam-text-body-secondary font-medium text-sam-fg">
                    {message.senderLabel}
                    <span className="ml-2 inline-flex align-middle">
                      <AdminCmMessageKindBadge kind={message.display?.kind ?? "text"} />
                    </span>
                    {message.isHiddenByAdmin ? (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 sam-text-xxs text-red-700">{t("admin_cm_badge_hidden")}</span>
                    ) : null}
                    {message.reportCount > 0 ? (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 sam-text-xxs text-amber-700">
                        {t("admin_cm_badge_reports", { count: message.reportCount })}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-1 sam-text-body">
                    <AdminCmMessageBody display={message.display} fallbackText={message.content || t("admin_cm_empty_message")} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.isHiddenByAdmin ? (
                      <button
                        type="button"
                        disabled={busy === `unhide:${message.id}`}
                        onClick={() => void runMessageAction(message.id, false)}
                        className="rounded border border-lime-200 bg-lime-50 px-2.5 py-1 sam-text-helper text-lime-700"
                      >
                        {t("admin_cm_action_unhide_message")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === `hide:${message.id}`}
                        onClick={() => void runMessageAction(message.id, true)}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 sam-text-helper text-orange-700"
                      >
                        {t("admin_cm_action_hide_message")}
                      </button>
                    )}
                  </div>
                </div>
                <div className="shrink-0 sam-text-helper text-sam-meta">{formatDateTime(message.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_room_reports">
        <div className="space-y-2">
          {detail.reports.length === 0 ? (
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_reports")}</div>
          ) : (
            detail.reports.map((report) => (
              <div key={report.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="sam-text-body font-medium text-sam-fg">
                      {adminChatLabel("report_target", report.reportType, ko).label} · {report.reporterLabel}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">
                      {t("admin_cm_common_status", { status: adminChatLabel("report_status", report.status, ko).label })} ·{" "}
                      {formatDateTime(report.createdAt)}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-fg">
                      {adminChatLabel("report_reason", report.reasonType, ko).label}
                      {report.reasonDetail ? ` · ${report.reasonDetail}` : ""}
                    </p>
                    {report.adminNote ? (
                      <p className="mt-1 sam-text-helper text-amber-700">{t("admin_cm_common_admin_note", { text: report.adminNote })}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void runReportAction(report.id, "reviewing")}
                      className="rounded border border-sam-border px-2.5 py-1 sam-text-helper text-sam-fg"
                    >
                      {t("admin_cm_action_reviewing")}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void runReportAction(report.id, "resolved")}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 sam-text-helper text-emerald-700"
                    >
                      {t("admin_cm_action_resolve")}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void runReportAction(report.id, "rejected")}
                      className="rounded border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-helper text-sam-fg"
                    >
                      {t("admin_cm_action_dismiss")}
                    </button>
                    {report.messageId ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void runReportAction(report.id, "sanction_message_hide")}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 sam-text-helper text-orange-700"
                      >
                        {t("admin_cm_action_sanction_hide")}
                      </button>
                    ) : null}
                    {report.roomId ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void runReportAction(report.id, "sanction_room_block")}
                        className="rounded border border-red-200 bg-red-50 px-2.5 py-1 sam-text-helper text-red-700"
                      >
                        {t("admin_cm_action_sanction_block_room")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <ForceEndConfirmModal
        open={pendingForceEndCall !== null}
        call={pendingForceEndCall}
        reasonCode={forceEndReasonCode}
        note={note}
        busy={pendingForceEndCall ? busy === `call:${pendingForceEndCall.id}:force_end` : false}
        onClose={() => {
          if (busy) return;
          setPendingForceEndCall(null);
        }}
        onConfirm={() => {
          if (!pendingForceEndCall) return;
          void runCallAction(pendingForceEndCall.id, "force_end");
        }}
      />
    </div>
  );
}

function Info({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="sam-text-helper text-sam-muted">{label}</div>
      <div className={`mt-1 sam-text-body text-sam-fg ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function ActionButton({
  busy,
  action,
  label,
  onRun,
}: {
  busy: string | null;
  action: RoomAction;
  label: string;
  onRun: (action: RoomAction) => Promise<void>;
}) {
  const { t } = useCmAdminLabels();
  return (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void onRun(action)}
      className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg disabled:opacity-50"
    >
      {busy === action ? t("admin_cm_common_processing") : label}
    </button>
  );
}

function ForceEndConfirmModal({
  open,
  call,
  reasonCode,
  note,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  call: PendingForceEndCall | null;
  reasonCode: CommunityMessengerCallForceEndReasonCode | "";
  note: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t, forceEndReasonLabel } = useCmAdminLabels();
  if (!call) return null;

  const reasonLabel =
    reasonCode ? forceEndReasonLabel(reasonCode) : t("admin_cm_force_end_reason_unselected");

  return (
    <DibayOverlayRoot
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      placement="center"
      zRole="dialog"
    >
      <div
        className={`${OverlayUi.dialogPanel} !max-w-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={OverlayUi.title}>{t("admin_cm_modal_force_end_title")}</h2>
      <p className="mt-2 rounded-ui-rect bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
        {t("admin_cm_modal_force_end_warning")}
      </p>
      <div className="mt-4 space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-sm text-sam-fg">
        <div>
          <span className="text-sam-muted">{t("admin_cm_modal_target_call")}</span>
          <div className="mt-1 font-medium text-sam-fg">
            {call.sessionMode === "group" ? t("admin_cm_call_group") : t("admin_cm_call_direct")} · {call.callKind}
          </div>
        </div>
        <div>
          <span className="text-sam-muted">{t("admin_cm_modal_initiator")}</span>
          <div className="mt-1">{call.initiatorLabel}</div>
        </div>
        <div>
          <span className="text-sam-muted">{t("admin_cm_modal_participants")}</span>
          <div className="mt-1">
            {t("admin_cm_common_participants_joined", { joined: call.joinedCount, invited: call.invitedCount, total: call.participantCount })}
          </div>
        </div>
        <div>
          <span className="text-sam-muted">{t("admin_cm_modal_reason_code")}</span>
          <div className="mt-1 text-sky-700">
            {reasonLabel}
            {reasonCode ? ` (${reasonCode})` : ""}
          </div>
        </div>
        <div>
          <span className="text-sam-muted">{t("admin_cm_modal_detail_note")}</span>
          <div className="mt-1 whitespace-pre-wrap">{note.trim()}</div>
        </div>
      </div>
      <div className={`${OverlayUi.actionsRow} mt-4`}>
        <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onClose}>
          {t("admin_cm_common_cancel")}
        </DibayOverlayButton>
        <DibayOverlayButton roleTone="destructive" disabled={busy} loading={busy} onClick={onConfirm}>
          {busy ? t("admin_cm_action_force_end_in_progress") : t("admin_cm_action_force_end_confirm")}
        </DibayOverlayButton>
      </div>
      </div>
    </DibayOverlayRoot>
  );
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

function matchesAuditPeriod(value: string, period: "24h" | "7d" | "30d" | "") {
  if (!period) return true;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const now = Date.now();
  const diff = now - date.getTime();
  const windowMs =
    period === "24h"
      ? 24 * 60 * 60 * 1000
      : period === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return diff >= 0 && diff <= windowMs;
}
