"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS,
  type CommunityMessengerCallForceEndReasonCode,
} from "@/lib/admin-community-messenger/call-force-end-reasons";
import type { AdminCommunityMessengerRoomDetail } from "@/lib/admin-community-messenger/service";
import { getSupabaseClient } from "@/lib/supabase/client";

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
          alert(json.error ?? "처리에 실패했습니다.");
          return;
        }
        setNote("");
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [note, refresh, roomId]
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
          alert(json.error ?? "메시지 조치에 실패했습니다.");
          return;
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh, roomId]
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
          alert(
            json.error === "admin_note_required"
              ? "강제 종료에는 운영 메모가 필수입니다."
              : json.error === "reason_code_required"
                ? "강제 종료 사유 코드를 선택해 주세요."
                : (json.error ?? "통화 세션 처리에 실패했습니다.")
          );
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
    [forceEndReasonCode, note, refresh]
  );

  const openForceEndConfirm = useCallback(
    (call: PendingForceEndCall) => {
      if (!forceEndReasonCode) {
        alert("강제 종료 사유 코드를 선택해 주세요.");
        return;
      }
      if (!note.trim()) {
        alert("강제 종료 사유를 운영 메모에 입력해 주세요.");
        return;
      }
      setPendingForceEndCall(call);
    },
    [forceEndReasonCode, note]
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
          alert(json.error ?? "신고 처리에 실패했습니다.");
          return;
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [note, refresh]
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
    return <div className="py-10 text-center text-[14px] text-sam-muted">불러오는 중...</div>;
  }

  if (!detail) {
    return <div className="py-10 text-center text-[14px] text-sam-muted">메신저 방을 찾을 수 없습니다.</div>;
  }

  const room = detail.room;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="메신저 방 상세"
        backHref="/admin/chats/messenger"
        description="방 상태 조치, 참여자 확인, 메시지 흐름 점검"
      />

      <AdminCard title="방 정보">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="방 제목" value={room.title} />
          <Info label="방 ID" value={room.id} mono />
          <Info
            label="유형"
            value={room.roomType === "open_group" ? "공개 그룹" : room.roomType === "private_group" ? "비공개 그룹" : "1:1"}
          />
          <Info label="상태" value={room.roomStatus} />
          <Info label="공개 여부" value={room.visibility === "public" ? "public" : "private"} />
          <Info label="입장 정책" value={room.joinPolicy} />
          <Info label="읽기 전용" value={room.isReadonly ? "ON" : "OFF"} />
          <Info label="생성자" value={room.createdByLabel} />
          <Info label="방장" value={room.ownerLabel} />
          <Info label="참여자 수" value={`${room.memberCount}명`} />
          <Info label="최대 인원" value={room.memberLimit ? `${room.memberLimit}명` : "-"} />
          <Info label="목록 노출" value={room.isDiscoverable ? "ON" : "OFF"} />
          <Info label="비밀번호 설정" value={room.requiresPassword ? "설정됨" : "없음"} />
          <Info label="최근 메시지 시간" value={formatDateTime(room.lastMessageAt)} />
          <Info label="방 소개" value={room.summary || "-"} full />
          <Info label="최근 메시지" value={room.lastMessage} full />
          <Info label="운영 메모" value={room.adminNote || "-"} full />
          <Info label="최근 조치 관리자" value={room.moderatedByLabel} />
          <Info label="최근 조치 시각" value={room.moderatedAt ? formatDateTime(room.moderatedAt) : "-"} />
        </div>
      </AdminCard>

      <AdminCard title="운영 조치">
        <div className="space-y-3">
          <select
            value={forceEndReasonCode}
            onChange={(e) => setForceEndReasonCode(e.target.value as CommunityMessengerCallForceEndReasonCode | "")}
            className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">강제 종료 사유 코드를 선택하세요</option>
            {COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="운영 메모를 남기세요. 강제 종료 시에는 선택한 사유 코드에 대한 상세 설명을 적어 주세요."
            className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
          />
          <p className="text-[12px] text-amber-700">통화 강제 종료에는 사유 코드 선택과 운영 메모 입력이 모두 필수입니다.</p>
          <div className="flex flex-wrap gap-2">
            {room.roomStatus !== "blocked" ? (
              <ActionButton busy={busy} action="block_room" label="채팅 차단" onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="unblock_room" label="차단 해제" onRun={runAction} />
            )}
            {room.roomStatus !== "archived" ? (
              <ActionButton busy={busy} action="archive_room" label="보관" onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="unarchive_room" label="보관 해제" onRun={runAction} />
            )}
            {!room.isReadonly ? (
              <ActionButton busy={busy} action="readonly_on" label="읽기 전용" onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="readonly_off" label="읽기 전용 해제" onRun={runAction} />
            )}
          </div>
        </div>
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard title="참여자">
          <div className="space-y-2">
            {detail.participants.map((participant) => (
              <div key={participant.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-sam-fg">{participant.label}</p>
                    <p className="mt-1 text-[12px] text-sam-muted">
                      {participant.role} · unread {participant.unreadCount}
                    </p>
                  </div>
                  <div className="text-right text-[12px] text-sam-meta">
                    <div>참여 {participant.joinedAt ? formatDateTime(participant.joinedAt) : "-"}</div>
                    <div className="mt-1">읽음 {participant.lastReadAt ? formatDateTime(participant.lastReadAt) : "-"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="최근 통화">
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={callStatusFilter}
              onChange={(e) =>
                setCallStatusFilter(
                  e.target.value as "missed" | "rejected" | "cancelled" | "ended" | "incoming" | "dialing" | ""
                )
              }
              className="rounded border border-sam-border px-3 py-2 text-[14px]"
            >
              <option value="">모든 기록 상태</option>
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
              className="rounded border border-sam-border px-3 py-2 text-[14px]"
            >
              <option value="">모든 통화 종류</option>
              <option value="voice">voice</option>
              <option value="video">video</option>
            </select>
          </div>
          <div className="space-y-2">
            {filteredCalls.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-sam-muted">통화 기록이 없습니다.</div>
            ) : (
              filteredCalls.map((call) => (
                <div key={call.id} className="rounded border border-sam-border-soft px-3 py-3">
                  <p className="text-[14px] font-medium text-sam-fg">
                    {call.callerLabel} {"->"} {call.peerLabel}
                  </p>
                  <p className="mt-1 text-[12px] text-sam-muted">
                    {call.callKind} · {call.status} · {call.durationSeconds}초
                  </p>
                  <p className="mt-1 text-[12px] text-sam-meta">{formatDateTime(call.startedAt)}</p>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard title="활성 통화 세션">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={activeCallStatusFilter}
            onChange={(e) => setActiveCallStatusFilter(e.target.value as "ringing" | "active" | "")}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">모든 활성 상태</option>
            <option value="ringing">ringing</option>
            <option value="active">active</option>
          </select>
          <select
            value={callKindFilter}
            onChange={(e) => setCallKindFilter(e.target.value as "voice" | "video" | "")}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">모든 통화 종류</option>
            <option value="voice">voice</option>
            <option value="video">video</option>
          </select>
        </div>
        <div className="space-y-2">
          {filteredActiveCalls.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-sam-muted">현재 진행 중인 통화 세션이 없습니다.</div>
          ) : (
            filteredActiveCalls.map((call) => (
              <div key={call.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-sam-fg">
                      {call.sessionMode === "group" ? "그룹 통화" : "1:1 통화"} · {call.callKind}
                    </p>
                    <p className="mt-1 text-[12px] text-sam-muted">
                      상태 {call.status} · 시작자 {call.initiatorLabel} · 시작 {formatDateTime(call.startedAt)}
                    </p>
                    <p className="mt-1 text-[12px] text-sam-fg">
                      참여 {call.joinedCount}명 · 대기 {call.invitedCount}명 · 전체 {call.participantCount}명
                    </p>
                    <p className="mt-1 text-[12px] text-sam-muted">
                      {call.participants.map((participant) => `${participant.label}(${participant.status})`).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === `call:${call.id}:force_end`}
                    onClick={() => openForceEndConfirm(call)}
                    className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700"
                  >
                    {busy === `call:${call.id}:force_end` ? "종료 중..." : "강제 종료"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="강제 종료 감사 로그">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder="관리자, 세션 ID, 메모 검색"
            className="min-w-[220px] rounded border border-sam-border px-3 py-2 text-[14px]"
          />
          <select
            value={auditPeriodFilter}
            onChange={(e) => setAuditPeriodFilter(e.target.value as "24h" | "7d" | "30d" | "")}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">전체 기간</option>
            <option value="24h">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
          </select>
          <div className="flex items-center text-[12px] text-sam-muted">결과 {filteredCallAudits.length}건</div>
        </div>
        <div className="space-y-2">
          {filteredCallAudits.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-sam-muted">이 방의 강제 종료 감사 로그가 없습니다.</div>
          ) : (
            filteredCallAudits.map((log) => (
              <div key={log.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-sam-fg">
                      관리자 {log.actorLabel}
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">강제 종료</span>
                    </p>
                    <p className="mt-1 font-mono text-[12px] text-sam-muted">{log.sessionId}</p>
                    {log.reasonCode ? (
                      <p className="mt-1 text-[12px] text-sky-700">
                        사유 코드: {log.reasonLabel} ({log.reasonCode})
                      </p>
                    ) : null}
                    <p className="mt-1 text-[12px] text-sam-fg">
                      상태 {log.beforeStatus} {"->"} {log.afterStatus}
                    </p>
                    {log.note ? <p className="mt-1 text-[12px] text-amber-700">메모: {log.note}</p> : null}
                  </div>
                  <div className="text-[12px] text-sam-meta">{formatDateTime(log.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="메시지 타임라인">
        <div className="space-y-2">
          {detail.messages.map((message) => (
            <div key={message.id} className="rounded border border-sam-border-soft px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-sam-fg">
                    {message.senderLabel}
                    <span className="ml-2 text-[12px] font-normal text-sam-meta">{message.messageType}</span>
                    {message.isHiddenByAdmin ? (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">숨김</span>
                    ) : null}
                    {message.reportCount > 0 ? (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                        신고 {message.reportCount}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] text-sam-fg">
                    {message.content || "(빈 메시지)"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.isHiddenByAdmin ? (
                      <button
                        type="button"
                        disabled={busy === `unhide:${message.id}`}
                        onClick={() => void runMessageAction(message.id, false)}
                        className="rounded border border-lime-200 bg-lime-50 px-2.5 py-1 text-[12px] text-lime-700"
                      >
                        숨김 해제
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === `hide:${message.id}`}
                        onClick={() => void runMessageAction(message.id, true)}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 text-[12px] text-orange-700"
                      >
                        메시지 숨김
                      </button>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-[12px] text-sam-meta">{formatDateTime(message.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="방 신고 내역">
        <div className="space-y-2">
          {detail.reports.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-sam-muted">이 방에 접수된 신고가 없습니다.</div>
          ) : (
            detail.reports.map((report) => (
              <div key={report.id} className="rounded border border-sam-border-soft px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-sam-fg">
                      {report.reportType} · {report.reporterLabel}
                    </p>
                    <p className="mt-1 text-[12px] text-sam-muted">
                      상태 {report.status} · {formatDateTime(report.createdAt)}
                    </p>
                    <p className="mt-1 text-[12px] text-sam-fg">
                      {report.reasonType}{report.reasonDetail ? ` · ${report.reasonDetail}` : ""}
                    </p>
                    {report.adminNote ? (
                      <p className="mt-1 text-[12px] text-amber-700">관리 메모: {report.adminNote}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:reviewing`}
                      onClick={() => void runReportAction(report.id, "reviewing")}
                      className="rounded border border-sam-border px-2.5 py-1 text-[12px] text-sam-fg"
                    >
                      검토중
                    </button>
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:resolved`}
                      onClick={() => void runReportAction(report.id, "resolved")}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-700"
                    >
                      해결
                    </button>
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:rejected`}
                      onClick={() => void runReportAction(report.id, "rejected")}
                      className="rounded border border-sam-border bg-sam-surface px-2.5 py-1 text-[12px] text-sam-fg"
                    >
                      기각
                    </button>
                    {report.messageId ? (
                      <button
                        type="button"
                        disabled={busy === `report:${report.id}:sanction_message_hide`}
                        onClick={() => void runReportAction(report.id, "sanction_message_hide")}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 text-[12px] text-orange-700"
                      >
                        메시지 숨김 제재
                      </button>
                    ) : null}
                    {report.roomId ? (
                      <button
                        type="button"
                        disabled={busy === `report:${report.id}:sanction_room_block`}
                        onClick={() => void runReportAction(report.id, "sanction_room_block")}
                        className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[12px] text-red-700"
                      >
                        방 차단 제재
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
      <div className="text-[12px] text-sam-muted">{label}</div>
      <div className={`mt-1 text-[14px] text-sam-fg ${mono ? "font-mono" : ""}`}>{value}</div>
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
  return (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void onRun(action)}
      className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg disabled:opacity-50"
    >
      {busy === action ? "처리 중..." : label}
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
  if (!open || !call) return null;

  const reasonLabel =
    COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.find((item) => item.code === reasonCode)?.label ?? "사유 미선택";

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface p-4 shadow-xl sm:rounded-ui-rect"
      >
        <h2 className="text-base font-bold text-sam-fg">통화 강제 종료 확인</h2>
        <p className="mt-2 rounded-ui-rect bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
          이 작업은 즉시 통화를 종료시키며 감사 로그에 기록됩니다. 실행 전에 대상과 사유를 다시 확인하세요.
        </p>
        <div className="mt-4 space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-sm text-sam-fg">
          <div>
            <span className="text-sam-muted">대상 통화</span>
            <div className="mt-1 font-medium text-sam-fg">
              {call.sessionMode === "group" ? "그룹 통화" : "1:1 통화"} · {call.callKind}
            </div>
          </div>
          <div>
            <span className="text-sam-muted">시작자</span>
            <div className="mt-1">{call.initiatorLabel}</div>
          </div>
          <div>
            <span className="text-sam-muted">참여 인원</span>
            <div className="mt-1">
              참여 {call.joinedCount}명 · 대기 {call.invitedCount}명 · 전체 {call.participantCount}명
            </div>
          </div>
          <div>
            <span className="text-sam-muted">사유 코드</span>
            <div className="mt-1 text-sky-700">
              {reasonLabel}
              {reasonCode ? ` (${reasonCode})` : ""}
            </div>
          </div>
          <div>
            <span className="text-sam-muted">상세 메모</span>
            <div className="mt-1 whitespace-pre-wrap">{note.trim()}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-ui-rect bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "강제 종료 중..." : "강제 종료 확인"}
          </button>
        </div>
      </div>
    </div>
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
