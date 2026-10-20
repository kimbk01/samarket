"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { AdminCommunityMessengerRoomDetail } from "@/lib/admin-community-messenger/service";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { useCmAdminLabels } from "./useCmAdminLabels";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminErrorState,
  AdminForbiddenState,
  AdminLoadingState,
  AdminResultBanner,
  isAdminForbiddenCode,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import type { AdminChatSheetSettle } from "@/components/admin/chats/AdminChatActionSheet";
import {
  AdminChatContentUnlockSheet,
  AdminChatForceEndSheet,
  AdminChatMessageHideSheet,
  AdminChatReportSheet,
  AdminChatRoomActionSheet,
  adminChatRoomActionIsDestructive,
  type AdminChatReportSheetInput,
  type AdminChatRoomAction,
} from "@/components/admin/chats/AdminChatSheets";
import Link from "next/link";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import { adminUserDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import {
  CHAT_ADMIN_REASON_QUERY_PARAM,
  type ChatAdminContentBasis,
  type ChatAdminContentDenial,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminCmMessageBody, AdminCmMessageKindBadge } from "@/components/admin/chats/AdminCmMessageBody";
import { useAdminOlderMessages } from "@/components/admin/chats/use-admin-older-messages";
import { useAdminLocationReturnTo } from "@/components/admin/chats/use-admin-location-return-to";
import { AdminCmRoomDomainLinksCard } from "./AdminCmRoomDomainLinksCard";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";

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
type ActiveCall = NonNullable<AdminCommunityMessengerRoomDetail["activeCalls"]>[number];
type CmReport = AdminCommunityMessengerRoomDetail["reports"][number];

/** 설계 §5 — 이 화면에서 여는 시트 (한 번에 하나). */
type OpenSheet =
  | { kind: "unlock" }
  | { kind: "room"; action: AdminChatRoomAction }
  | { kind: "message"; message: CmMessageItem; hidden: boolean }
  | { kind: "force_end"; call: ActiveCall }
  | { kind: "report"; report: CmReport };

const CM_REPORT_OPEN = new Set(["received", "reviewing"]);

function cmReportSheetInput(
  report: CmReport,
  reasonLabel: string,
  reportedUserHref: string | null
): AdminChatReportSheetInput {
  return {
    source: "messenger",
    id: report.id,
    bucket:
      report.status === "received" || report.status === "reviewing"
        ? report.status
        : report.status === "rejected"
          ? "dismissed"
          : "resolved",
    reasonLabel,
    detail: report.reasonDetail,
    reporterLabel: report.reporterLabel,
    reportedLabel: report.reportedUserLabel,
    createdAt: report.createdAt,
    cmMessageId: report.messageId,
    cmRoomId: report.roomId,
    reportedUserHref,
  };
}

export function AdminCommunityMessengerDetailPage({ roomId }: { roomId: string }) {
  const { t, formatDateTime } = useCmAdminLabels();
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
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
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

  // R1-A: 본문 열람 감사는 서버 GET 내부에서 기록한다 — 사유는 시트 S1 에서 받는다.
  const unlockContent = useCallback(
    async (reason: string): Promise<boolean> => {
      viewReasonRef.current = reason;
      await refresh();
      return true;
    },
    [refresh]
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

  /** 시트 결과 공통 처리 (설계 §5 실패·충돌). */
  const onSheetSettled = useCallback(
    (kind: AdminChatSheetSettle, opts?: { reportQueue?: boolean }) => {
      setSheet(null);
      setResult({
        ok: true,
        message:
          kind === "done"
            ? t("admin_chat_sheet_done")
            : kind === "stale"
              ? t("admin_chat_sheet_stale")
              : t("admin_chat_sheet_gone"),
      });
      if (opts?.reportQueue) emitAdminQueueChanged("messenger_actionable");
      void refresh(true);
    },
    [refresh, t]
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
    return <AdminLoadingState ko={ko} />;
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
  const roomLabel = room.title || room.id;
  const chatDomain = contentAccess?.domain || room.chatDomain;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_cm_page_detail_title"
        backHref={returnCtx.returnTo ?? "/admin/chats"}
        descriptionKey="admin_cm_page_detail_desc"
      />

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3">
        <p className="sam-text-body font-semibold text-sam-fg">{t("admin_chat_r1_ghost_banner_title")}</p>
        <p className="mt-1 sam-text-helper text-sam-warning">{t("admin_chat_r1_ghost_banner_body")}</p>
        {contentAccess?.granted ? (
          <p className="mt-1 sam-text-helper font-medium text-sam-fg">{t(CONTENT_BASIS_KEYS[contentAccess.basis])}</p>
        ) : null}
      </div>

      <AdminCard titleKey="admin_cm_card_room_info">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label={t("admin_cm_label_room_title")} value={room.title} />
          <Info label={t("admin_cm_label_room_id")} value={room.id} mono />
          <Info label={t("admin_cm_th_type")} value={adminChatLabel("chat_domain", chatDomain, ko).label} />
          <Info label={t("admin_cm_th_status")} value={adminChatLabel("room_status", room.roomStatus, ko).label} />
          <Info
            label={t("admin_cm_label_visibility")}
            value={room.visibility === "public" ? t("admin_chat_room_visibility_public") : t("admin_chat_room_visibility_private")}
          />
          <Info
            label={t("admin_cm_label_join_policy")}
            value={room.joinPolicy === "password" ? t("admin_chat_room_join_password") : t("admin_chat_room_join_invite")}
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
                      : row.action.includes("exit")
                        ? t("admin_cm_ghost_action_exit")
                        : t("admin_chat_audit_action_other")}
                </span>
                {" · "}
                {formatDateTime(row.createdAt)}
                {row.actorId ? <> · <AdminTechId id={row.actorId} /></> : ""}
                {row.reason ? ` · ${row.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_ops_actions">
        <div className="flex flex-wrap justify-end gap-2" data-admin-chat-room-actions>
          {(
            [
              room.roomStatus !== "blocked" ? "block_room" : "unblock_room",
              room.roomStatus !== "archived" ? "archive_room" : "unarchive_room",
              !room.isReadonly ? "readonly_on" : "readonly_off",
            ] as AdminChatRoomAction[]
          ).map((action) => (
            <AdminActionButton
              key={action}
              variant={adminChatRoomActionIsDestructive(action) ? "danger" : "secondary"}
              disabled={sheet !== null}
              onClick={() => setSheet({ kind: "room", action })}
            >
              {t(ROOM_ACTION_LABEL[action])}
            </AdminActionButton>
          ))}
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
                      {t("admin_chat_unread_count", { count: participant.unreadCount })}
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
              <option value="missed">{adminChatLabel("call_status", "missed", ko).label}</option>
              <option value="rejected">{adminChatLabel("call_status", "rejected", ko).label}</option>
              <option value="cancelled">{adminChatLabel("call_status", "cancelled", ko).label}</option>
              <option value="ended">{adminChatLabel("call_status", "ended", ko).label}</option>
              <option value="incoming">{adminChatLabel("call_status", "incoming", ko).label}</option>
              <option value="dialing">{adminChatLabel("call_status", "dialing", ko).label}</option>
            </select>
            <select
              value={callKindFilter}
              onChange={(e) => setCallKindFilter(e.target.value as "voice" | "video" | "")}
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">{t("admin_cm_filter_all_call_kind")}</option>
              <option value="voice">{adminChatLabel("call_kind", "voice", ko).label}</option>
              <option value="video">{adminChatLabel("call_kind", "video", ko).label}</option>
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
            <option value="ringing">{adminChatLabel("call_status", "ringing", ko).label}</option>
            <option value="active">{adminChatLabel("call_status", "active", ko).label}</option>
          </select>
          <select
            value={callKindFilter}
            onChange={(e) => setCallKindFilter(e.target.value as "voice" | "video" | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_filter_all_call_kind")}</option>
            <option value="voice">{adminChatLabel("call_kind", "voice", ko).label}</option>
            <option value="video">{adminChatLabel("call_kind", "video", ko).label}</option>
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
                  <AdminActionButton
                    variant="danger"
                    disabled={sheet !== null}
                    onClick={() => setSheet({ kind: "force_end", call })}
                  >
                    {t("admin_cm_action_force_end")}
                  </AdminActionButton>
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
                      <span className="ml-2 rounded bg-sam-danger-soft px-1.5 py-0.5 sam-text-xxs text-sam-danger">{t("admin_cm_force_end_badge")}</span>
                    </p>
                    <p className="mt-1 font-mono sam-text-helper text-sam-muted">{log.sessionId}</p>
                    {log.reasonCode ? (
                      <p className="mt-1 sam-text-helper text-sam-info">
                        {t("admin_cm_common_reason_code", { label: log.reasonLabel, code: log.reasonCode ?? "" })}
                      </p>
                    ) : null}
                    <p className="mt-1 sam-text-helper text-sam-fg">
                      {t("admin_cm_common_status", { status: `${log.beforeStatus} -> ${log.afterStatus}` })}
                    </p>
                    {log.note ? <p className="mt-1 sam-text-helper text-sam-warning">{t("admin_cm_common_note", { text: log.note })}</p> : null}
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
              className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-4 sam-text-body text-sam-fg"
            >
              <p className="font-medium">{t("admin_chat_r1_content_locked_title")}</p>
              <p className="mt-1 sam-text-helper">
                {contentAccess.denial === "super_admin_only"
                  ? t("admin_chat_r1_content_locked_super_admin")
                  : t("admin_chat_r1_content_locked_reason")}
              </p>
              {contentAccess.denial === "ghost_reason_required" ? (
                <AdminActionButton className="mt-3" onClick={() => setSheet({ kind: "unlock" })}>
                  {t("admin_chat_r1_content_unlock_cta")}
                </AdminActionButton>
              ) : null}
            </div>
          ) : null}
          {olderMsgs.hasMore ? (
            <div className="flex flex-col items-center gap-1 py-1">
              <AdminActionButton disabled={olderMsgs.loading} onClick={() => void olderMsgs.loadOlder()}>
                {olderMsgs.loading ? t("admin_chat_r1b_loading_older") : t("admin_chat_r1b_load_older")}
              </AdminActionButton>
              {olderMsgs.error ? <p className="sam-text-xxs text-sam-danger">{t("admin_chat_r1b_load_older_failed")}</p> : null}
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
                      <span className="ml-2 rounded bg-sam-danger-soft px-1.5 py-0.5 sam-text-xxs text-sam-danger">{t("admin_cm_badge_hidden")}</span>
                    ) : null}
                    {message.reportCount > 0 ? (
                      <span className="ml-2 rounded bg-sam-warning-soft px-1.5 py-0.5 sam-text-xxs text-sam-warning">
                        {t("admin_cm_badge_reports", { count: message.reportCount })}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-1 sam-text-body">
                    <AdminCmMessageBody
                      display={message.display}
                      fallbackText={message.content || t("admin_cm_empty_message")}
                      mediaReason={viewReasonRef.current}
                    />
                  </div>
                  {message.senderId ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <AdminActionButton
                        variant={message.isHiddenByAdmin ? "secondary" : "danger"}
                        disabled={sheet !== null}
                        onClick={() => setSheet({ kind: "message", message, hidden: !message.isHiddenByAdmin })}
                      >
                        {message.isHiddenByAdmin ? t("admin_cm_action_unhide_message") : t("admin_cm_action_hide_message")}
                      </AdminActionButton>
                    </div>
                  ) : null}
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
                      <p className="mt-1 sam-text-helper text-sam-warning">{t("admin_cm_common_admin_note", { text: report.adminNote })}</p>
                    ) : null}
                  </div>
                  {CM_REPORT_OPEN.has(report.status) ? (
                    <AdminActionButton
                      variant="primary"
                      disabled={sheet !== null}
                      onClick={() => setSheet({ kind: "report", report })}
                    >
                      {t("admin_chat_report_process_cta")}
                    </AdminActionButton>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      {sheet?.kind === "unlock" ? (
        <AdminChatContentUnlockSheet roomLabel={roomLabel} onUnlock={unlockContent} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === "room" ? (
        <AdminChatRoomActionSheet
          roomId={room.id}
          roomLabel={roomLabel}
          currentStatus={room.roomStatus}
          isReadonly={room.isReadonly}
          action={sheet.action}
          onClose={() => setSheet(null)}
          onSettled={(kind) => onSheetSettled(kind)}
        />
      ) : null}
      {sheet?.kind === "message" ? (
        <AdminChatMessageHideSheet
          roomId={room.id}
          messageId={sheet.message.id}
          senderLabel={sheet.message.senderLabel}
          createdAt={sheet.message.createdAt}
          preview={sheet.message.display?.text || sheet.message.content}
          hidden={sheet.hidden}
          onClose={() => setSheet(null)}
          onSettled={(kind) => {
            if (kind === "done") patchOlder(sheet.message.id, { isHiddenByAdmin: sheet.hidden });
            onSheetSettled(kind);
          }}
        />
      ) : null}
      {sheet?.kind === "force_end" ? (
        <AdminChatForceEndSheet
          sessionId={sheet.call.id}
          callLabel={`${sheet.call.sessionMode === "group" ? t("admin_cm_call_group") : t("admin_cm_call_direct")} · ${adminChatLabel("call_kind", sheet.call.callKind, ko).label}`}
          initiatorLabel={sheet.call.initiatorLabel}
          participantsLabel={t("admin_cm_common_participants_joined", {
            joined: sheet.call.joinedCount,
            invited: sheet.call.invitedCount,
            total: sheet.call.participantCount,
          })}
          startedAt={sheet.call.startedAt}
          onClose={() => setSheet(null)}
          onSettled={(kind) => onSheetSettled(kind)}
        />
      ) : null}
      {sheet?.kind === "report" ? (
        <AdminChatReportSheet
          report={cmReportSheetInput(
            sheet.report,
            adminChatLabel("report_reason", sheet.report.reasonType, ko).label,
            sheet.report.reportedUserId ? adminUserDetailHref(sheet.report.reportedUserId, returnCtx.here) : null
          )}
          onClose={() => setSheet(null)}
          onSettled={(kind) => onSheetSettled(kind, { reportQueue: true })}
        />
      ) : null}
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

const ROOM_ACTION_LABEL: Record<AdminChatRoomAction, MessageKey> = {
  block_room: "admin_cm_action_block_chat",
  unblock_room: "admin_cm_action_unblock_chat",
  archive_room: "admin_cm_action_archive",
  unarchive_room: "admin_cm_action_unarchive",
  readonly_on: "admin_cm_action_readonly_on",
  readonly_off: "admin_cm_action_readonly_off",
};

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
