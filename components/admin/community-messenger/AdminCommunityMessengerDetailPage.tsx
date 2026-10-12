"use client";

import { dibayAlert, DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { CommunityMessengerCallForceEndReasonCode } from "@/lib/admin-community-messenger/call-force-end-reasons";
import type { AdminCommunityMessengerRoomDetail } from "@/lib/admin-community-messenger/service";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useCmAdminLabels } from "./useCmAdminLabels";

type DetailResponse = AdminCommunityMessengerRoomDetail & { ok?: boolean };
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
  const [detail, setDetail] = useState<AdminCommunityMessengerRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
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
      const res = await fetch(`/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DetailResponse;
      if (res.ok && json.ok) {
        setDetail(json);
      } else {
        setDetail(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Phase3 S2-2: Ghost enter on Admin Console room open; exit on leave.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/ghost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enter", reason: "admin_console_detail" }),
      });
      if (!cancelled && res.ok) {
        void refresh(true);
      }
    })();
    return () => {
      cancelled = true;
      void fetch(`/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/ghost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exit", reason: "admin_console_leave" }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [refresh, roomId]);

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
      .channel(`admin-community-messenger-room:${roomId}`)
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
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs" },
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
      setBusy(action);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/action`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, note }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: json.error ?? t("admin_cm_err_action_failed") });
          return;
        }
        setNote("");
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [note, refresh, roomId, t]
  );

  const runMessageAction = useCallback(
    async (messageId: string, hidden: boolean) => {
      const key = `${hidden ? "hide" : "unhide"}:${messageId}`;
      setBusy(key);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hidden }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: json.error ?? t("admin_cm_err_message_action_failed") });
          return;
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh, roomId, t]
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
      const key = `report:${reportId}:${action}`;
      setBusy(key);
      try {
        const res = await fetch(`/api/admin/community-messenger/reports/${encodeURIComponent(reportId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, adminNote: note }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          await dibayAlert({ title: json.error ?? t("admin_cm_err_report_failed") });
          return;
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [note, refresh, t]
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

  if (!detail) {
    return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_not_found")}</div>;
  }

  const room = detail.room;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_cm_page_detail_title"
        backHref="/admin/chats/messenger"
        descriptionKey="admin_cm_page_detail_desc"
      />

      <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="sam-text-body font-semibold text-amber-900">{t("admin_cm_ghost_banner_title")}</p>
        <p className="mt-1 sam-text-helper text-amber-800">{t("admin_cm_ghost_banner_body")}</p>
      </div>

      <AdminCard titleKey="admin_cm_card_room_info">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label={t("admin_cm_label_room_title")} value={room.title} />
          <Info label={t("admin_cm_label_room_id")} value={room.id} mono />
          <Info
            label={t("admin_cm_th_type")}
            value={roomTypeLabel(room.roomType === "open_group" ? "open_group" : room.roomType === "private_group" ? "private_group" : "direct")}
          />
          <Info label={t("admin_cm_th_status")} value={room.roomStatus} />
          <Info label={t("admin_cm_label_visibility")} value={room.visibility === "public" ? "public" : "private"} />
          <Info label={t("admin_cm_label_join_policy")} value={room.joinPolicy} />
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

      <AdminCard titleKey="admin_cm_ghost_audits_title">
        {(detail.ghostAudits?.length ?? 0) === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("admin_cm_ghost_audits_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {(detail.ghostAudits ?? []).slice(0, 20).map((row) => (
              <li key={row.id} className="rounded border border-sam-border-soft px-3 py-2 sam-text-helper text-sam-fg">
                <span className="font-semibold">
                  {row.action.includes("enter")
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
                    <p className="sam-text-body font-medium text-sam-fg">{participant.label}</p>
                    <p className="mt-1 sam-text-helper text-sam-muted">
                      {participant.role} · unread {participant.unreadCount}
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
          {detail.messages.map((message) => (
            <div key={message.id} className="rounded border border-sam-border-soft px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="sam-text-body-secondary font-medium text-sam-fg">
                    {message.senderLabel}
                    <span className="ml-2 sam-text-helper font-normal text-sam-meta">{message.messageType}</span>
                    {message.isHiddenByAdmin ? (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 sam-text-xxs text-red-700">{t("admin_cm_badge_hidden")}</span>
                    ) : null}
                    {message.reportCount > 0 ? (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 sam-text-xxs text-amber-700">
                        {t("admin_cm_badge_reports", { count: message.reportCount })}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap sam-text-body text-sam-fg">
                    {message.content || t("admin_cm_empty_message")}
                  </p>
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
                      {report.reportType} · {report.reporterLabel}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">
                      {t("admin_cm_common_status", { status: report.status })} · {formatDateTime(report.createdAt)}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-fg">
                      {report.reasonType}{report.reasonDetail ? ` · ${report.reasonDetail}` : ""}
                    </p>
                    {report.adminNote ? (
                      <p className="mt-1 sam-text-helper text-amber-700">{t("admin_cm_common_admin_note", { text: report.adminNote })}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:reviewing`}
                      onClick={() => void runReportAction(report.id, "reviewing")}
                      className="rounded border border-sam-border px-2.5 py-1 sam-text-helper text-sam-fg"
                    >
                      {t("admin_cm_action_reviewing")}
                    </button>
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:resolved`}
                      onClick={() => void runReportAction(report.id, "resolved")}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 sam-text-helper text-emerald-700"
                    >
                      {t("admin_cm_action_resolve")}
                    </button>
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:rejected`}
                      onClick={() => void runReportAction(report.id, "rejected")}
                      className="rounded border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-helper text-sam-fg"
                    >
                      {t("admin_cm_action_dismiss")}
                    </button>
                    {report.messageId ? (
                      <button
                        type="button"
                        disabled={busy === `report:${report.id}:sanction_message_hide`}
                        onClick={() => void runReportAction(report.id, "sanction_message_hide")}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 sam-text-helper text-orange-700"
                      >
                        {t("admin_cm_action_sanction_hide")}
                      </button>
                    ) : null}
                    {report.roomId ? (
                      <button
                        type="button"
                        disabled={busy === `report:${report.id}:sanction_room_block`}
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
