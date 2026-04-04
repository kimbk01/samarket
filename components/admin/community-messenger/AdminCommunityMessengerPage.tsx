"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AdminCommunityMessengerActiveCallSession,
  AdminCommunityMessengerCallAuditLog,
  AdminCommunityMessengerCallLog,
  AdminCommunityMessengerDashboard,
  AdminCommunityMessengerFriendRequest,
  AdminCommunityMessengerReport,
  AdminCommunityMessengerRoomSummary,
} from "@/lib/admin-community-messenger/service";
import type { CommunityMessengerFriendRequestStatus, CommunityMessengerRoomStatus } from "@/lib/community-messenger/types";

type DashboardResponse = AdminCommunityMessengerDashboard & { ok?: boolean };

export function AdminCommunityMessengerPage() {
  const [data, setData] = useState<AdminCommunityMessengerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomStatusFilter, setRoomStatusFilter] = useState<CommunityMessengerRoomStatus | "">("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<"direct" | "group" | "">("");
  const [requestStatusFilter, setRequestStatusFilter] = useState<CommunityMessengerFriendRequestStatus | "">("");
  const [callQuery, setCallQuery] = useState("");
  const [callModeFilter, setCallModeFilter] = useState<"direct" | "group" | "">("");
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
      const res = await fetch("/api/admin/community-messenger/overview", { cache: "no-store" });
      const json = (await res.json()) as DashboardResponse;
      if (res.ok && json.ok) {
        setData({
          stats: json.stats,
          forceEndReasonStats: json.forceEndReasonStats ?? [],
          rooms: json.rooms ?? [],
          requests: json.requests ?? [],
          calls: json.calls ?? [],
          activeCalls: json.activeCalls ?? [],
          callAudits: json.callAudits ?? [],
          reports: json.reports ?? [],
        });
      } else {
        setData(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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
      .channel("admin-community-messenger-overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_rooms" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_participants" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_friend_requests" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_call_logs" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_call_sessions" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_call_session_participants" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_messenger_reports" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [refresh]);

  const filteredRooms = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (data?.rooms ?? []).filter((room) => {
      if (roomStatusFilter && room.roomStatus !== roomStatusFilter) return false;
      if (roomTypeFilter && room.roomType !== roomTypeFilter) return false;
      if (!keyword) return true;
      const haystack = [
        room.id,
        room.title,
        room.createdByLabel,
        room.memberLabels.join(" "),
        room.lastMessage,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [data?.rooms, query, roomStatusFilter, roomTypeFilter]);

  const filteredRequests = useMemo(() => {
    return (data?.requests ?? []).filter((request) =>
      requestStatusFilter ? request.status === requestStatusFilter : true
    );
  }, [data?.requests, requestStatusFilter]);

  const filteredCalls = useMemo(() => {
    const keyword = callQuery.trim().toLowerCase();
    return (data?.calls ?? []).filter((call) => {
      if (callModeFilter && call.sessionMode !== callModeFilter) return false;
      if (callStatusFilter && call.status !== callStatusFilter) return false;
      if (callKindFilter && call.callKind !== callKindFilter) return false;
      if (!keyword) return true;
      const haystack = [call.roomTitle, call.callerLabel, call.peerLabel, call.status, call.callKind]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [callKindFilter, callModeFilter, callQuery, callStatusFilter, data?.calls]);

  const filteredActiveCalls = useMemo(() => {
    const keyword = callQuery.trim().toLowerCase();
    return (data?.activeCalls ?? []).filter((call) => {
      if (callModeFilter && call.sessionMode !== callModeFilter) return false;
      if (activeCallStatusFilter && call.status !== activeCallStatusFilter) return false;
      if (callKindFilter && call.callKind !== callKindFilter) return false;
      if (!keyword) return true;
      const haystack = [
        call.roomTitle,
        call.initiatorLabel,
        call.callKind,
        call.status,
        ...call.participants.map((participant) => participant.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeCallStatusFilter, callKindFilter, callModeFilter, callQuery, data?.activeCalls]);

  const filteredCallAudits = useMemo(() => {
    const keyword = auditQuery.trim().toLowerCase();
    return (data?.callAudits ?? []).filter((log) => {
      if (!matchesAuditPeriod(log.createdAt, auditPeriodFilter)) return false;
      if (!keyword) return true;
      const haystack = [
        log.roomTitle,
        log.actorLabel,
        log.reasonCode,
        log.reasonLabel,
        log.note,
        log.sessionId,
        log.roomId,
        log.action,
        log.beforeStatus,
        log.afterStatus,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [auditPeriodFilter, auditQuery, data?.callAudits]);

  const handleRequestAction = useCallback(
    async (requestId: string, status: CommunityMessengerFriendRequestStatus) => {
      setBusy(`request:${requestId}:${status}`);
      try {
        await fetch(`/api/admin/community-messenger/friend-requests/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="커뮤니티 메신저 운영"
        description="친구 요청, 1:1·그룹 채팅방, 통화 기록을 관리자에서 통합 관리합니다."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="전체 메신저 방" value={data?.stats.totalRooms ?? 0} helper="직접 + 그룹" />
        <StatCard label="활성 방" value={data?.stats.activeRooms ?? 0} helper="정상 운영 중" />
        <StatCard label="운영 차단/보관" value={(data?.stats.blockedRooms ?? 0) + (data?.stats.archivedRooms ?? 0)} helper="blocked + archived" />
        <StatCard label="대기 친구 요청" value={data?.stats.pendingRequests ?? 0} helper="관리 검토 가능" />
        <StatCard label="활성 통화 세션" value={data?.stats.activeCallSessions ?? 0} helper="ringing + active" />
        <StatCard label="활성 그룹 통화" value={data?.stats.activeGroupCallSessions ?? 0} helper="group sessions" />
        <StatCard label="미처리 신고" value={data?.stats.openReports ?? 0} helper="received + reviewing" />
        <StatCard label="강제 종료 누적" value={data?.stats.forceEndTotal ?? 0} helper="감사 로그 기준" />
      </div>

      <AdminCard title="강제 종료 사유 KPI">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.forceEndReasonStats ?? []).map((item) => (
            <ForceEndReasonKpiCard key={item.code} label={item.label} code={item.code} count={item.count} share={item.share} />
          ))}
        </div>
      </AdminCard>

      <AdminCard title="메신저 방 목록">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="방 제목, 참여자, 최근 메시지 검색"
            className="min-w-[220px] rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
          <select
            value={roomStatusFilter}
            onChange={(e) => setRoomStatusFilter(e.target.value as CommunityMessengerRoomStatus | "")}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            <option value="">모든 상태</option>
            <option value="active">active</option>
            <option value="blocked">blocked</option>
            <option value="archived">archived</option>
          </select>
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value as "direct" | "group" | "")}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            <option value="">모든 유형</option>
            <option value="direct">1:1</option>
            <option value="group">그룹</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-700"
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-[14px] text-gray-500">불러오는 중...</div>
        ) : filteredRooms.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-gray-500">표시할 메신저 방이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[14px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2">방</th>
                  <th className="px-3 py-2">유형</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">생성자</th>
                  <th className="px-3 py-2">참여자</th>
                  <th className="px-3 py-2">최근 메시지</th>
                  <th className="px-3 py-2">최근 시간</th>
                  <th className="px-3 py-2 text-right">상세</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((room) => (
                  <RoomRow key={room.id} room={room} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard title="활성 통화 세션">
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={callQuery}
              onChange={(e) => setCallQuery(e.target.value)}
              placeholder="통화방, 시작자, 참여자 검색"
              className="min-w-[220px] rounded border border-gray-200 px-3 py-2 text-[14px]"
            />
            <select
              value={callModeFilter}
              onChange={(e) => setCallModeFilter(e.target.value as "direct" | "group" | "")}
              className="rounded border border-gray-200 px-3 py-2 text-[14px]"
            >
              <option value="">모든 통화 유형</option>
              <option value="direct">1:1</option>
              <option value="group">그룹</option>
            </select>
            <select
              value={activeCallStatusFilter}
              onChange={(e) => setActiveCallStatusFilter(e.target.value as "ringing" | "active" | "")}
              className="rounded border border-gray-200 px-3 py-2 text-[14px]"
            >
              <option value="">모든 활성 상태</option>
              <option value="ringing">ringing</option>
              <option value="active">active</option>
            </select>
            <select
              value={callKindFilter}
              onChange={(e) => setCallKindFilter(e.target.value as "voice" | "video" | "")}
              className="rounded border border-gray-200 px-3 py-2 text-[14px]"
            >
              <option value="">모든 통화 종류</option>
              <option value="voice">voice</option>
              <option value="video">video</option>
            </select>
          </div>
          <div className="space-y-2">
            {filteredActiveCalls.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-gray-500">활성 통화 세션이 없습니다.</div>
            ) : (
              filteredActiveCalls.map((call) => <ActiveCallRow key={call.id} call={call} />)
            )}
          </div>
        </AdminCard>

        <AdminCard title="친구 요청 관리">
          <div className="mb-3 flex items-center gap-2">
            <select
              value={requestStatusFilter}
              onChange={(e) =>
                setRequestStatusFilter(e.target.value as CommunityMessengerFriendRequestStatus | "")
              }
              className="rounded border border-gray-200 px-3 py-2 text-[14px]"
            >
              <option value="">모든 요청 상태</option>
              <option value="pending">pending</option>
              <option value="accepted">accepted</option>
              <option value="rejected">rejected</option>
              <option value="cancelled">cancelled</option>
              <option value="blocked">blocked</option>
            </select>
          </div>
          <div className="space-y-2">
            {filteredRequests.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-gray-500">친구 요청이 없습니다.</div>
            ) : (
              filteredRequests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  busy={busy}
                  onAction={handleRequestAction}
                />
              ))
            )}
          </div>
        </AdminCard>

        <AdminCard title="최근 통화 기록">
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={callStatusFilter}
              onChange={(e) =>
                setCallStatusFilter(
                  e.target.value as "missed" | "rejected" | "cancelled" | "ended" | "incoming" | "dialing" | ""
                )
              }
              className="rounded border border-gray-200 px-3 py-2 text-[14px]"
            >
              <option value="">모든 기록 상태</option>
              <option value="missed">missed</option>
              <option value="rejected">rejected</option>
              <option value="cancelled">cancelled</option>
              <option value="ended">ended</option>
              <option value="incoming">incoming</option>
              <option value="dialing">dialing</option>
            </select>
          </div>
          <div className="space-y-2">
            {filteredCalls.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-gray-500">통화 기록이 없습니다.</div>
            ) : (
              filteredCalls.map((call) => <CallRow key={call.id} call={call} />)
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard title="강제 종료 감사 로그">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder="방 제목, 관리자, 세션 ID, 메모 검색"
            className="min-w-[220px] rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
          <select
            value={auditPeriodFilter}
            onChange={(e) => setAuditPeriodFilter(e.target.value as "24h" | "7d" | "30d" | "")}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            <option value="">전체 기간</option>
            <option value="24h">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
          </select>
          <div className="flex items-center text-[12px] text-gray-500">결과 {filteredCallAudits.length}건</div>
        </div>
        <div className="space-y-2">
          {filteredCallAudits.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-gray-500">강제 종료 감사 로그가 없습니다.</div>
          ) : (
            filteredCallAudits.map((log) => <CallAuditRow key={log.id} log={log} />)
          )}
        </div>
      </AdminCard>

      <AdminCard title="최근 메신저 신고">
        <div className="space-y-2">
          {(data?.reports ?? []).length === 0 ? (
            <div className="py-8 text-center text-[14px] text-gray-500">메신저 신고가 없습니다.</div>
          ) : (
            (data?.reports ?? []).map((report) => (
              <ReportRow key={report.id} report={report} busy={busy} onRefresh={refresh} />
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-[13px] text-gray-500">{label}</p>
      <p className="mt-2 text-[28px] font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-[12px] text-gray-400">{helper}</p>
    </div>
  );
}

function ForceEndReasonKpiCard({
  label,
  code,
  count,
  share,
}: {
  label: string;
  code: string;
  count: number;
  share: number;
}) {
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-gray-500">{label}</p>
          <p className="mt-1 font-mono text-[11px] text-gray-400">{code}</p>
        </div>
        <p className="text-[24px] font-semibold text-gray-900">{count}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-gray-500">전체 강제 종료 중 {percent}%</p>
    </div>
  );
}

function RoomRow({ room }: { room: AdminCommunityMessengerRoomSummary }) {
  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="px-3 py-3">
        <div className="font-medium text-gray-900">{room.title}</div>
        <div className="mt-1 font-mono text-[12px] text-gray-400">{room.id}</div>
        {room.adminNote ? <div className="mt-1 text-[12px] text-amber-700">메모: {room.adminNote}</div> : null}
      </td>
      <td className="px-3 py-3 text-gray-700">{room.roomType === "group" ? "그룹" : "1:1"}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-gray-100 px-2 py-1 text-[12px] text-gray-700">{room.roomStatus}</span>
          {room.isReadonly ? (
            <span className="rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-700">readonly</span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-gray-700">{room.createdByLabel}</td>
      <td className="px-3 py-3 text-gray-700">
        <div>{room.memberCount}명</div>
        <div className="mt-1 text-[12px] text-gray-500">{room.memberLabels.join(", ")}</div>
      </td>
      <td className="px-3 py-3 text-gray-700">{room.lastMessage}</td>
      <td className="px-3 py-3 whitespace-nowrap text-gray-500">{formatDateTime(room.lastMessageAt)}</td>
      <td className="px-3 py-3 text-right">
        <Link
          href={`/admin/chats/messenger/${encodeURIComponent(room.id)}`}
          className="text-signature hover:underline"
        >
          상세보기
        </Link>
      </td>
    </tr>
  );
}

function RequestRow({
  request,
  busy,
  onAction,
}: {
  request: AdminCommunityMessengerFriendRequest;
  busy: string | null;
  onAction: (requestId: string, status: CommunityMessengerFriendRequestStatus) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">
            {request.requesterLabel} {"->"} {request.addresseeLabel}
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            상태 {request.status} · 생성 {formatDateTime(request.createdAt)}
          </p>
          {request.note ? <p className="mt-1 text-[12px] text-gray-700">요청 메모: {request.note}</p> : null}
          {request.adminNote ? (
            <p className="mt-1 text-[12px] text-amber-700">관리 메모: {request.adminNote}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy === `request:${request.id}:accepted`}
            onClick={() => void onAction(request.id, "accepted")}
            className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-700"
          >
            승인
          </button>
          <button
            type="button"
            disabled={busy === `request:${request.id}:rejected`}
            onClick={() => void onAction(request.id, "rejected")}
            className="rounded border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-700"
          >
            거절
          </button>
          <button
            type="button"
            disabled={busy === `request:${request.id}:blocked`}
            onClick={() => void onAction(request.id, "blocked")}
            className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700"
          >
            차단 처리
          </button>
        </div>
      </div>
    </div>
  );
}

function CallRow({ call }: { call: AdminCommunityMessengerCallLog }) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">
            {call.roomTitle}
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
              {call.sessionMode === "group" ? "그룹" : "1:1"}
            </span>
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            {call.callerLabel} {"->"} {call.peerLabel}
          </p>
          <p className="mt-1 text-[12px] text-gray-700">
            {call.callKind} · {call.status} · {call.durationSeconds}초 · 참여 {call.participantCount}명
          </p>
        </div>
        <div className="text-[12px] text-gray-400">{formatDateTime(call.startedAt)}</div>
      </div>
    </div>
  );
}

function ActiveCallRow({ call }: { call: AdminCommunityMessengerActiveCallSession }) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">
            {call.roomTitle}
            <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">
              {call.sessionMode === "group" ? "그룹" : "1:1"}
            </span>
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            시작자 {call.initiatorLabel} · {call.callKind} · {call.status}
          </p>
          <p className="mt-1 text-[12px] text-gray-700">
            참여 {call.joinedCount}명 · 대기 {call.invitedCount}명 · 전체 {call.participantCount}명
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            {call.participants.map((participant) => `${participant.label}(${participant.status})`).join(", ")}
          </p>
        </div>
        <div className="text-right text-[12px] text-gray-400">
          <div>{formatDateTime(call.startedAt)}</div>
          <div className="mt-1">
            <Link
              href={`/admin/chats/messenger/${encodeURIComponent(call.roomId)}`}
              className="text-signature hover:underline"
            >
              방 상세
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallAuditRow({ log }: { log: AdminCommunityMessengerCallAuditLog }) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">
            {log.roomTitle}
            <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">강제 종료</span>
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            관리자 {log.actorLabel} · {log.beforeStatus} {"->"} {log.afterStatus}
          </p>
          {log.reasonCode ? (
            <p className="mt-1 text-[12px] text-sky-700">
              사유 코드: {log.reasonLabel} ({log.reasonCode})
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-gray-700 font-mono">{log.sessionId}</p>
          {log.note ? <p className="mt-1 text-[12px] text-amber-700">메모: {log.note}</p> : null}
        </div>
        <div className="text-right text-[12px] text-gray-400">
          <div>{formatDateTime(log.createdAt)}</div>
          <div className="mt-1">
            <Link
              href={`/admin/chats/messenger/${encodeURIComponent(log.roomId)}`}
              className="text-signature hover:underline"
            >
              방 상세
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportRow({
  report,
  busy,
  onRefresh,
}: {
  report: AdminCommunityMessengerReport;
  busy: string | null;
  onRefresh: () => Promise<void>;
}) {
  const run = async (action: "reviewing" | "resolved" | "rejected" | "sanction_message_hide" | "sanction_room_block") => {
    const key = `report:${report.id}:${action}`;
    try {
      const res = await fetch(`/api/admin/community-messenger/reports/${encodeURIComponent(report.id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "신고 처리 실패");
        return;
      }
      await onRefresh();
    } finally {}
  };

  return (
    <div className="rounded-lg border border-gray-100 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">
            {report.reportType} · {report.roomTitle}
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            신고자 {report.reporterLabel} · 대상 {report.reportedUserLabel} · 상태 {report.status}
          </p>
          <p className="mt-1 text-[12px] text-gray-700">
            사유 {report.reasonType}{report.reasonDetail ? ` · ${report.reasonDetail}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy === `report:${report.id}:reviewing`}
            onClick={() => void run("reviewing")}
            className="rounded border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-700"
          >
            검토중
          </button>
          <button
            type="button"
            disabled={busy === `report:${report.id}:resolved`}
            onClick={() => void run("resolved")}
            className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-700"
          >
            해결
          </button>
          {report.messageId ? (
            <button
              type="button"
              disabled={busy === `report:${report.id}:sanction_message_hide`}
              onClick={() => void run("sanction_message_hide")}
              className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[12px] text-orange-700"
            >
              메시지 숨김
            </button>
          ) : null}
          {report.roomId ? (
            <button
              type="button"
              disabled={busy === `report:${report.id}:sanction_room_block`}
              onClick={() => void run("sanction_room_block")}
              className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700"
            >
              방 차단
            </button>
          ) : null}
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
