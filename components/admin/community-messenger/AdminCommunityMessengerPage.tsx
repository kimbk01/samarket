"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS } from "@/lib/admin-community-messenger/call-force-end-reasons";
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

const FORCE_END_HEATMAP_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const FORCE_END_HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`);

export function AdminCommunityMessengerPage() {
  const searchParams = useSearchParams();
  const initialListQueryAppliedRef = useRef(false);
  const [data, setData] = useState<AdminCommunityMessengerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomStatusFilter, setRoomStatusFilter] = useState<CommunityMessengerRoomStatus | "">("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<"direct" | "private_group" | "open_group" | "">("");
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
  const [forceEndReasonFilter, setForceEndReasonFilter] = useState("");
  const [forceEndAnalysisPeriodFilter, setForceEndAnalysisPeriodFilter] = useState<"24h" | "7d" | "30d" | "">("");

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 다른 관리 화면에서 `/admin/chats/messenger?room=…` · `?q=…` 로 점프 */
  useEffect(() => {
    if (initialListQueryAppliedRef.current) return;
    const room = searchParams.get("room")?.trim();
    const q = searchParams.get("q")?.trim();
    const v = room || q;
    if (v) {
      setQuery(v);
      initialListQueryAppliedRef.current = true;
    }
  }, [searchParams]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/community-messenger/overview", { cache: "no-store" });
      const json = (await res.json()) as DashboardResponse;
      if (res.ok && json.ok) {
        setData({
          stats: json.stats,
          forceEndReasonStats: json.forceEndReasonStats ?? [],
          forceEndTrendStats: json.forceEndTrendStats ?? [],
          forceEndAdminStats: json.forceEndAdminStats ?? [],
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

  const analyticsAuditsByReason = useMemo(() => {
    return (data?.callAudits ?? []).filter((log) => {
      if (forceEndReasonFilter && log.reasonCode !== forceEndReasonFilter) return false;
      return true;
    });
  }, [data?.callAudits, forceEndReasonFilter]);

  const filteredAnalyticsAudits = useMemo(() => {
    return analyticsAuditsByReason.filter((log) => matchesAuditPeriod(log.createdAt, forceEndAnalysisPeriodFilter));
  }, [analyticsAuditsByReason, forceEndAnalysisPeriodFilter]);

  const roomTypeByRoomId = useMemo(() => {
    return new Map((data?.rooms ?? []).map((room) => [room.id, room.roomType]));
  }, [data?.rooms]);

  const roomTitleByRoomId = useMemo(() => {
    return new Map((data?.rooms ?? []).map((room) => [room.id, room.title]));
  }, [data?.rooms]);

  const callLogBySessionId = useMemo(() => {
    const map = new Map<string, AdminCommunityMessengerCallLog>();
    for (const call of data?.calls ?? []) {
      if (!call.sessionId || map.has(call.sessionId)) continue;
      map.set(call.sessionId, call);
    }
    return map;
  }, [data?.calls]);

  const filteredForceEndReasonStats = useMemo(() => {
    return buildForceEndReasonStats(filteredAnalyticsAudits);
  }, [filteredAnalyticsAudits]);

  const filteredForceEndTrendStats = useMemo(() => {
    return buildForceEndTrendStats(analyticsAuditsByReason, forceEndAnalysisPeriodFilter);
  }, [analyticsAuditsByReason, forceEndAnalysisPeriodFilter]);

  const filteredForceEndAdminStats = useMemo(() => {
    return buildForceEndAdminStats(filteredAnalyticsAudits);
  }, [filteredAnalyticsAudits]);

  const filteredForceEndRoomTypeStats = useMemo(() => {
    return buildForceEndRoomTypeStats(filteredAnalyticsAudits, roomTypeByRoomId);
  }, [filteredAnalyticsAudits, roomTypeByRoomId]);

  const filteredForceEndRecurrenceAnalysis = useMemo(() => {
    return buildForceEndRecurrenceAnalysis(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId);
  }, [callLogBySessionId, filteredAnalyticsAudits, roomTitleByRoomId]);

  const filteredForceEndReasonRecurrenceStats = useMemo(() => {
    return buildForceEndReasonRecurrenceStats(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId);
  }, [callLogBySessionId, filteredAnalyticsAudits, roomTitleByRoomId]);

  const filteredForceEndAdminEffectStats = useMemo(() => {
    return buildForceEndAdminEffectStats(filteredAnalyticsAudits, callLogBySessionId);
  }, [callLogBySessionId, filteredAnalyticsAudits]);

  const filteredForceEndHeatmapStats = useMemo(() => {
    return buildForceEndHeatmapStats(filteredAnalyticsAudits, callLogBySessionId);
  }, [callLogBySessionId, filteredAnalyticsAudits]);

  const filteredForceEndReasonHeatmapStats = useMemo(() => {
    return buildForceEndReasonHeatmapStats(filteredAnalyticsAudits, callLogBySessionId);
  }, [callLogBySessionId, filteredAnalyticsAudits]);

  const filteredForceEndReasonAdminStats = useMemo(() => {
    return buildForceEndReasonAdminStats(filteredAnalyticsAudits);
  }, [filteredAnalyticsAudits]);

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
        <StatCard label="전체 메신저 방" value={data?.stats.totalRooms ?? 0} helper="1:1 + 비공개 + 공개" />
        <StatCard label="활성 방" value={data?.stats.activeRooms ?? 0} helper="정상 운영 중" />
        <StatCard label="운영 차단/보관" value={(data?.stats.blockedRooms ?? 0) + (data?.stats.archivedRooms ?? 0)} helper="blocked + archived" />
        <StatCard label="대기 친구 요청" value={data?.stats.pendingRequests ?? 0} helper="관리 검토 가능" />
        <StatCard label="비공개 그룹" value={data?.stats.privateGroupRooms ?? 0} helper="friend invite" />
        <StatCard label="공개 그룹" value={data?.stats.openGroupRooms ?? 0} helper="password join" />
        <StatCard label="활성 통화 세션" value={data?.stats.activeCallSessions ?? 0} helper="ringing + active" />
        <StatCard label="활성 그룹 통화" value={data?.stats.activeGroupCallSessions ?? 0} helper="group sessions" />
        <StatCard label="미처리 신고" value={data?.stats.openReports ?? 0} helper="received + reviewing" />
        <StatCard label="강제 종료 누적" value={data?.stats.forceEndTotal ?? 0} helper="감사 로그 기준" />
      </div>

      <AdminCard title="강제 종료 분석">
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={forceEndReasonFilter}
            onChange={(e) => setForceEndReasonFilter(e.target.value)}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">모든 사유 코드</option>
            {COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
          <select
            value={forceEndAnalysisPeriodFilter}
            onChange={(e) => setForceEndAnalysisPeriodFilter(e.target.value as "24h" | "7d" | "30d" | "")}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">전체 기간</option>
            <option value="24h">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setForceEndReasonFilter("");
              setForceEndAnalysisPeriodFilter("");
            }}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
          >
            필터 초기화
          </button>
          <div className="flex items-center text-[12px] text-sam-muted">분석 대상 {filteredAnalyticsAudits.length}건</div>
        </div>
      </AdminCard>

      <AdminCard title="강제 종료 사유 KPI">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredForceEndReasonStats.map((item) => (
            <ForceEndReasonKpiCard key={item.code} label={item.label} code={item.code} count={item.count} share={item.share} />
          ))}
        </div>
      </AdminCard>

      <AdminCard title="강제 종료 추이">
        <div className="grid gap-3 md:grid-cols-3">
          {filteredForceEndTrendStats.map((item) => (
            <ForceEndTrendCard
              key={item.key}
              label={item.label}
              currentCount={item.currentCount}
              previousCount={item.previousCount}
              delta={item.delta}
              direction={item.direction}
            />
          ))}
        </div>
      </AdminCard>

      <AdminCard title="관리자별 강제 종료 집계">
        <div className="space-y-2">
          {filteredForceEndAdminStats.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-sam-muted">강제 종료 집계가 없습니다.</div>
          ) : (
            filteredForceEndAdminStats.map((item) => (
              <ForceEndAdminRow key={item.adminLabel} adminLabel={item.adminLabel} count={item.count} share={item.share} />
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="방 유형별 강제 종료 분석">
        <div className="grid gap-3 md:grid-cols-3">
          {filteredForceEndRoomTypeStats.map((item) => (
            <ForceEndRoomTypeCard
              key={item.key}
              label={item.label}
              count={item.count}
              share={item.share}
            />
          ))}
        </div>
      </AdminCard>

      <AdminCard title="강제 종료 재발 분석">
        <div className="grid gap-3 md:grid-cols-2">
          <ForceEndRecurrenceSummaryCard
            label="재발 방"
            subjectCount={filteredForceEndRecurrenceAnalysis.room.repeatedSubjects}
            repeatCount={filteredForceEndRecurrenceAnalysis.room.repeatedEvents}
            analyzedCount={filteredForceEndRecurrenceAnalysis.room.analyzedCount}
            share={filteredForceEndRecurrenceAnalysis.room.share}
            helper="같은 방에서 2회 이상 강제 종료"
          />
          <ForceEndRecurrenceSummaryCard
            label="재발 발신자"
            subjectCount={filteredForceEndRecurrenceAnalysis.caller.repeatedSubjects}
            repeatCount={filteredForceEndRecurrenceAnalysis.caller.repeatedEvents}
            analyzedCount={filteredForceEndRecurrenceAnalysis.caller.analyzedCount}
            share={filteredForceEndRecurrenceAnalysis.caller.share}
            helper="세션 매핑 가능한 발신자 기준"
          />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-sam-fg">반복 발생 방 TOP</p>
            {filteredForceEndRecurrenceAnalysis.room.topItems.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-6 text-center text-[13px] text-sam-muted">
                반복 발생 방이 없습니다.
              </div>
            ) : (
              filteredForceEndRecurrenceAnalysis.room.topItems.map((item) => (
                <ForceEndRecurrenceRow
                  key={`room:${item.key}`}
                  label={item.label}
                  totalCount={item.totalCount}
                  repeatCount={item.repeatCount}
                  latestAt={item.latestAt}
                />
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-sam-fg">반복 발생 발신자 TOP</p>
            {filteredForceEndRecurrenceAnalysis.caller.topItems.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-6 text-center text-[13px] text-sam-muted">
                반복 발생 발신자가 없습니다.
              </div>
            ) : (
              filteredForceEndRecurrenceAnalysis.caller.topItems.map((item) => (
                <ForceEndRecurrenceRow
                  key={`caller:${item.key}`}
                  label={item.label}
                  totalCount={item.totalCount}
                  repeatCount={item.repeatCount}
                  latestAt={item.latestAt}
                />
              ))
            )}
          </div>
        </div>
      </AdminCard>

      <AdminCard title="사유 코드 x 재발 여부">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredForceEndReasonRecurrenceStats.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center text-[13px] text-sam-muted md:col-span-2 xl:col-span-3">
              재발 분석 대상 사유 코드가 없습니다.
            </div>
          ) : (
            filteredForceEndReasonRecurrenceStats.map((item) => (
              <ForceEndReasonRecurrenceCard
                key={item.code}
                label={item.label}
                code={item.code}
                totalCount={item.totalCount}
                roomRepeatedSubjects={item.roomRepeatedSubjects}
                roomRepeatedEvents={item.roomRepeatedEvents}
                roomRepeatShare={item.roomRepeatShare}
                callerRepeatedSubjects={item.callerRepeatedSubjects}
                callerRepeatedEvents={item.callerRepeatedEvents}
                callerRepeatShare={item.callerRepeatShare}
              />
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="관리자별 재발 억제 효과">
        <div className="space-y-2">
          {filteredForceEndAdminEffectStats.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-sam-muted">재발 억제 효과를 계산할 데이터가 없습니다.</div>
          ) : (
            filteredForceEndAdminEffectStats.map((item) => (
              <ForceEndAdminEffectRow
                key={item.adminLabel}
                adminLabel={item.adminLabel}
                totalCount={item.totalCount}
                roomFollowupCount={item.roomFollowupCount}
                roomSuppressionRate={item.roomSuppressionRate}
                callerEvaluatedCount={item.callerEvaluatedCount}
                callerFollowupCount={item.callerFollowupCount}
                callerSuppressionRate={item.callerSuppressionRate}
              />
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="시간대별 강제 종료/재발 히트맵">
        <div className="grid gap-4 xl:grid-cols-2">
          <ForceEndHeatmapCard
            title="강제 종료 분포"
            description="요일/시간대별 전체 강제 종료 건수"
            matrix={filteredForceEndHeatmapStats.totalMatrix}
            maxCount={filteredForceEndHeatmapStats.maxTotalCount}
            topSlots={filteredForceEndHeatmapStats.topForceEndSlots}
            tone="red"
          />
          <ForceEndHeatmapCard
            title="후속 재발 분포"
            description="해당 시점 이후 같은 방 또는 발신자에서 다시 강제 종료된 케이스"
            matrix={filteredForceEndHeatmapStats.recurrenceMatrix}
            maxCount={filteredForceEndHeatmapStats.maxRecurrenceCount}
            topSlots={filteredForceEndHeatmapStats.topRecurrenceSlots}
            tone="amber"
          />
        </div>
      </AdminCard>

      <AdminCard title="사유 코드 x 시간대 히트맵">
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredForceEndReasonHeatmapStats.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center text-[13px] text-sam-muted xl:col-span-2">
              시간대 패턴을 표시할 사유 코드가 없습니다.
            </div>
          ) : (
            filteredForceEndReasonHeatmapStats.map((item) => (
              <ForceEndReasonHeatmapCard
                key={item.code}
                code={item.code}
                label={item.label}
                totalCount={item.totalCount}
                recurrenceCount={item.recurrenceCount}
                recurrenceShare={item.recurrenceShare}
                matrix={item.matrix}
                maxCount={item.maxCount}
                topSlots={item.topSlots}
              />
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="사유 코드 x 관리자">
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredForceEndReasonAdminStats.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center text-[13px] text-sam-muted xl:col-span-2">
              운영자 교차 분석 대상 사유 코드가 없습니다.
            </div>
          ) : (
            filteredForceEndReasonAdminStats.map((item) => (
              <ForceEndReasonAdminCard
                key={item.code}
                code={item.code}
                label={item.label}
                totalCount={item.totalCount}
                uniqueAdminCount={item.uniqueAdminCount}
                topAdmins={item.topAdmins}
              />
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard title="메신저 방 목록">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="방 제목, 참여자, 최근 메시지 검색"
            className="min-w-[220px] rounded border border-sam-border px-3 py-2 text-[14px]"
          />
          <select
            value={roomStatusFilter}
            onChange={(e) => setRoomStatusFilter(e.target.value as CommunityMessengerRoomStatus | "")}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">모든 상태</option>
            <option value="active">active</option>
            <option value="blocked">blocked</option>
            <option value="archived">archived</option>
          </select>
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value as "direct" | "private_group" | "open_group" | "")}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            <option value="">모든 유형</option>
            <option value="direct">1:1</option>
            <option value="private_group">비공개 그룹</option>
            <option value="open_group">공개 그룹</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-[14px] text-sam-muted">불러오는 중...</div>
        ) : filteredRooms.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-sam-muted">표시할 메신저 방이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[14px]">
              <thead>
                <tr className="border-b border-sam-border text-left text-sam-muted">
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
              className="min-w-[220px] rounded border border-sam-border px-3 py-2 text-[14px]"
            />
            <select
              value={callModeFilter}
              onChange={(e) => setCallModeFilter(e.target.value as "direct" | "group" | "")}
              className="rounded border border-sam-border px-3 py-2 text-[14px]"
            >
              <option value="">모든 통화 유형</option>
              <option value="direct">1:1</option>
              <option value="group">그룹</option>
            </select>
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
              <div className="py-8 text-center text-[14px] text-sam-muted">활성 통화 세션이 없습니다.</div>
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
              className="rounded border border-sam-border px-3 py-2 text-[14px]"
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
              <div className="py-8 text-center text-[14px] text-sam-muted">친구 요청이 없습니다.</div>
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
          </div>
          <div className="space-y-2">
            {filteredCalls.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-sam-muted">통화 기록이 없습니다.</div>
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
            <div className="py-8 text-center text-[14px] text-sam-muted">강제 종료 감사 로그가 없습니다.</div>
          ) : (
            filteredCallAudits.map((log) => <CallAuditRow key={log.id} log={log} />)
          )}
        </div>
      </AdminCard>

      <AdminCard title="최근 메신저 신고">
        <div className="space-y-2">
          {(data?.reports ?? []).length === 0 ? (
            <div className="py-8 text-center text-[14px] text-sam-muted">메신저 신고가 없습니다.</div>
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
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="text-[13px] text-sam-muted">{label}</p>
      <p className="mt-2 text-[28px] font-semibold text-sam-fg">{value}</p>
      <p className="mt-1 text-[12px] text-sam-meta">{helper}</p>
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
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-sam-muted">{label}</p>
          <p className="mt-1 font-mono text-[11px] text-sam-meta">{code}</p>
        </div>
        <p className="text-[24px] font-semibold text-sam-fg">{count}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
        <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-sam-muted">전체 강제 종료 중 {percent}%</p>
    </div>
  );
}

function ForceEndTrendCard({
  label,
  currentCount,
  previousCount,
  delta,
  direction,
}: {
  label: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  direction: "up" | "down" | "flat";
}) {
  const toneClass =
    direction === "up"
      ? "text-red-700 bg-red-50"
      : direction === "down"
        ? "text-emerald-700 bg-emerald-50"
        : "text-sam-fg bg-sam-surface-muted";
  const deltaLabel =
    direction === "up" ? `+${delta}` : direction === "down" ? `${delta}` : "0";

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-sam-muted">{label}</p>
          <p className="mt-2 text-[28px] font-semibold text-sam-fg">{currentCount}</p>
        </div>
        <span className={`rounded px-2 py-1 text-[12px] font-medium ${toneClass}`}>{deltaLabel}</span>
      </div>
      <p className="mt-2 text-[12px] text-sam-muted">이전 동일 기간 {previousCount}건 대비</p>
    </div>
  );
}

function ForceEndAdminRow({
  adminLabel,
  count,
  share,
}: {
  adminLabel: string;
  count: number;
  share: number;
}) {
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-sam-fg">{adminLabel}</p>
          <p className="mt-1 text-[12px] text-sam-muted">전체 강제 종료 중 {percent}%</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-semibold text-sam-fg">{count}</p>
          <p className="text-[11px] text-sam-meta">건수</p>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
        <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function ForceEndRoomTypeCard({
  label,
  count,
  share,
}: {
  label: string;
  count: number;
  share: number;
}) {
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="text-[13px] text-sam-muted">{label}</p>
      <p className="mt-2 text-[28px] font-semibold text-sam-fg">{count}</p>
      <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
        <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-sam-muted">전체 강제 종료 중 {percent}%</p>
    </div>
  );
}

function ForceEndRecurrenceSummaryCard({
  label,
  subjectCount,
  repeatCount,
  analyzedCount,
  share,
  helper,
}: {
  label: string;
  subjectCount: number;
  repeatCount: number;
  analyzedCount: number;
  share: number;
  helper: string;
}) {
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-sam-muted">{label}</p>
          <p className="mt-2 text-[28px] font-semibold text-sam-fg">{subjectCount}</p>
        </div>
        <span className="rounded bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-700">{percent}%</span>
      </div>
      <p className="mt-2 text-[12px] text-sam-muted">{helper}</p>
      <p className="mt-1 text-[12px] text-sam-muted">재발 {repeatCount}건 · 분석 {analyzedCount}건</p>
      <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
        <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.max(percent, repeatCount > 0 ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function ForceEndRecurrenceRow({
  label,
  totalCount,
  repeatCount,
  latestAt,
}: {
  label: string;
  totalCount: number;
  repeatCount: number;
  latestAt: string;
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-sam-fg">{label}</p>
          <p className="mt-1 text-[12px] text-sam-muted">총 {totalCount}건 · 재발 {repeatCount}건</p>
        </div>
        <div className="text-right text-[12px] text-sam-meta">{formatDateTime(latestAt)}</div>
      </div>
    </div>
  );
}

function ForceEndReasonRecurrenceCard({
  label,
  code,
  totalCount,
  roomRepeatedSubjects,
  roomRepeatedEvents,
  roomRepeatShare,
  callerRepeatedSubjects,
  callerRepeatedEvents,
  callerRepeatShare,
}: {
  label: string;
  code: string;
  totalCount: number;
  roomRepeatedSubjects: number;
  roomRepeatedEvents: number;
  roomRepeatShare: number;
  callerRepeatedSubjects: number;
  callerRepeatedEvents: number;
  callerRepeatShare: number;
}) {
  const roomPercent = Math.round(roomRepeatShare * 100);
  const callerPercent = Math.round(callerRepeatShare * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-sam-muted">{label}</p>
          <p className="mt-1 font-mono text-[11px] text-sam-meta">{code}</p>
        </div>
        <div className="text-right">
          <p className="text-[24px] font-semibold text-sam-fg">{totalCount}</p>
          <p className="text-[11px] text-sam-meta">총 강제 종료</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-sam-muted">방 재발</span>
            <span className="font-medium text-sam-fg">{roomPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(roomPercent, roomRepeatedEvents > 0 ? 8 : 0)}%` }} />
          </div>
          <p className="mt-1 text-[12px] text-sam-muted">반복 방 {roomRepeatedSubjects}개 · 재발 {roomRepeatedEvents}건</p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-sam-muted">발신자 재발</span>
            <span className="font-medium text-sam-fg">{callerPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(callerPercent, callerRepeatedEvents > 0 ? 8 : 0)}%` }} />
          </div>
          <p className="mt-1 text-[12px] text-sam-muted">
            반복 발신자 {callerRepeatedSubjects}명 · 재발 {callerRepeatedEvents}건
          </p>
        </div>
      </div>
    </div>
  );
}

function ForceEndAdminEffectRow({
  adminLabel,
  totalCount,
  roomFollowupCount,
  roomSuppressionRate,
  callerEvaluatedCount,
  callerFollowupCount,
  callerSuppressionRate,
}: {
  adminLabel: string;
  totalCount: number;
  roomFollowupCount: number;
  roomSuppressionRate: number;
  callerEvaluatedCount: number;
  callerFollowupCount: number;
  callerSuppressionRate: number;
}) {
  const roomPercent = Math.round(roomSuppressionRate * 100);
  const callerPercent = Math.round(callerSuppressionRate * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-sam-fg">{adminLabel}</p>
          <p className="mt-1 text-[12px] text-sam-muted">총 강제 종료 {totalCount}건</p>
        </div>
        <div className="text-right text-[12px] text-sam-meta">
          <div>방 후속 재발 {roomFollowupCount}건</div>
          <div className="mt-1">발신자 후속 재발 {callerFollowupCount}건</div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-sam-muted">방 기준 억제율</span>
            <span className="font-medium text-sam-fg">{roomPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(roomPercent, totalCount > 0 ? 8 : 0)}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-sam-muted">발신자 기준 억제율</span>
            <span className="font-medium text-sam-fg">{callerPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div
              className="h-2 rounded-full bg-sky-500"
              style={{ width: `${Math.max(callerPercent, callerEvaluatedCount > 0 ? 8 : 0)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-sam-meta">발신자 매핑 가능 {callerEvaluatedCount}건 기준</p>
        </div>
      </div>
    </div>
  );
}

function ForceEndHeatmapCard({
  title,
  description,
  matrix,
  maxCount,
  topSlots,
  tone,
}: {
  title: string;
  description: string;
  matrix: number[][];
  maxCount: number;
  topSlots: Array<{ label: string; count: number }>;
  tone: "red" | "amber";
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="text-[14px] font-medium text-sam-fg">{title}</p>
      <p className="mt-1 text-[12px] text-sam-muted">{description}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[11px] font-medium text-sam-meta">요일</th>
              {FORCE_END_HEATMAP_HOURS.map((hourLabel) => (
                <th key={hourLabel} className="px-1 py-1 text-center text-[10px] font-medium text-sam-meta">
                  {hourLabel.replace("시", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FORCE_END_HEATMAP_WEEKDAYS.map((weekday, dayIndex) => (
              <tr key={weekday}>
                <th className="px-2 py-1 text-left text-[11px] font-medium text-sam-muted">{weekday}</th>
                {matrix[dayIndex].map((count, hour) => (
                  <td
                    key={`${weekday}-${hour}`}
                    title={`${weekday} ${String(hour).padStart(2, "0")}:00 · ${count}건`}
                    className="h-8 min-w-8 rounded text-center text-[10px] font-medium text-sam-fg"
                    style={getHeatmapCellStyle(count, maxCount, tone)}
                  >
                    {count > 0 ? count : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-sam-muted">
        <span className="inline-block h-2 w-8 rounded bg-sam-surface-muted" />
        <span>낮음</span>
        <span className={`inline-block h-2 w-8 rounded ${tone === "red" ? "bg-red-400" : "bg-amber-400"}`} />
        <span>높음</span>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-[12px] font-medium text-sam-fg">집중 시간대</p>
        {topSlots.length === 0 ? (
          <p className="text-[12px] text-sam-muted">집계 데이터가 없습니다.</p>
        ) : (
          topSlots.map((slot) => (
            <p key={slot.label} className="text-[12px] text-sam-muted">
              {slot.label} · {slot.count}건
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function ForceEndReasonHeatmapCard({
  code,
  label,
  totalCount,
  recurrenceCount,
  recurrenceShare,
  matrix,
  maxCount,
  topSlots,
}: {
  code: string;
  label: string;
  totalCount: number;
  recurrenceCount: number;
  recurrenceShare: number;
  matrix: number[][];
  maxCount: number;
  topSlots: Array<{ label: string; count: number }>;
}) {
  const recurrencePercent = Math.round(recurrenceShare * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">{label}</p>
          <p className="mt-1 font-mono text-[11px] text-sam-meta">{code}</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-semibold text-sam-fg">{totalCount}</p>
          <p className="text-[11px] text-sam-meta">총 강제 종료</p>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-sam-muted">
        후속 재발 {recurrenceCount}건 · 재발 비중 {recurrencePercent}%
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[11px] font-medium text-sam-meta">요일</th>
              {FORCE_END_HEATMAP_HOURS.map((hourLabel) => (
                <th key={hourLabel} className="px-1 py-1 text-center text-[10px] font-medium text-sam-meta">
                  {hourLabel.replace("시", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FORCE_END_HEATMAP_WEEKDAYS.map((weekday, dayIndex) => (
              <tr key={`${code}:${weekday}`}>
                <th className="px-2 py-1 text-left text-[11px] font-medium text-sam-muted">{weekday}</th>
                {matrix[dayIndex].map((count, hour) => (
                  <td
                    key={`${code}:${weekday}-${hour}`}
                    title={`${label} · ${weekday} ${String(hour).padStart(2, "0")}:00 · ${count}건`}
                    className="h-8 min-w-8 rounded text-center text-[10px] font-medium text-sam-fg"
                    style={getHeatmapCellStyle(count, maxCount, "red")}
                  >
                    {count > 0 ? count : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-[12px] font-medium text-sam-fg">집중 시간대</p>
        {topSlots.length === 0 ? (
          <p className="text-[12px] text-sam-muted">집계 데이터가 없습니다.</p>
        ) : (
          topSlots.map((slot) => (
            <p key={`${code}:${slot.label}`} className="text-[12px] text-sam-muted">
              {slot.label} · {slot.count}건
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function ForceEndReasonAdminCard({
  code,
  label,
  totalCount,
  uniqueAdminCount,
  topAdmins,
}: {
  code: string;
  label: string;
  totalCount: number;
  uniqueAdminCount: number;
  topAdmins: Array<{ adminLabel: string; count: number; share: number }>;
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">{label}</p>
          <p className="mt-1 font-mono text-[11px] text-sam-meta">{code}</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-semibold text-sam-fg">{totalCount}</p>
          <p className="text-[11px] text-sam-meta">총 강제 종료</p>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-sam-muted">처리 운영자 {uniqueAdminCount}명</p>
      <div className="mt-4 space-y-2">
        {topAdmins.length === 0 ? (
          <p className="text-[12px] text-sam-muted">집계 가능한 운영자 데이터가 없습니다.</p>
        ) : (
          topAdmins.map((item) => {
            const percent = Math.round(item.share * 100);
            return (
              <div key={`${code}:${item.adminLabel}`} className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-sam-fg">{item.adminLabel}</p>
                    <p className="mt-1 text-[11px] text-sam-muted">이 사유 내 점유율 {percent}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] font-semibold text-sam-fg">{item.count}</p>
                    <p className="text-[11px] text-sam-meta">건수</p>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
                  <div className="h-2 rounded-full bg-fuchsia-500" style={{ width: `${Math.max(percent, item.count > 0 ? 8 : 0)}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RoomRow({ room }: { room: AdminCommunityMessengerRoomSummary }) {
  return (
    <tr className="border-b border-sam-border-soft align-top">
      <td className="px-3 py-3">
        <div className="font-medium text-sam-fg">{room.title}</div>
        <div className="mt-1 font-mono text-[12px] text-sam-meta">{room.id}</div>
        {room.adminNote ? <div className="mt-1 text-[12px] text-amber-700">메모: {room.adminNote}</div> : null}
      </td>
      <td className="px-3 py-3 text-sam-fg">
        {room.roomType === "open_group" ? "공개 그룹" : room.roomType === "private_group" ? "비공개 그룹" : "1:1"}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-sam-surface-muted px-2 py-1 text-[12px] text-sam-fg">{room.roomStatus}</span>
          {room.isReadonly ? (
            <span className="rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-700">readonly</span>
          ) : null}
          {room.roomType === "open_group" ? (
            <span className="rounded bg-sky-50 px-2 py-1 text-[12px] text-sky-700">
              {room.isDiscoverable ? "discoverable" : "hidden"}
            </span>
          ) : null}
          {room.requiresPassword ? (
            <span className="rounded bg-sam-surface-muted px-2 py-1 text-[12px] text-sam-fg">password</span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-sam-fg">{room.createdByLabel}</td>
      <td className="px-3 py-3 text-sam-fg">
        <div>{room.memberCount}명</div>
        <div className="mt-1 text-[12px] text-sam-muted">{room.memberLabels.join(", ")}</div>
      </td>
      <td className="px-3 py-3 text-sam-fg">{room.lastMessage}</td>
      <td className="px-3 py-3 whitespace-nowrap text-sam-muted">{formatDateTime(room.lastMessageAt)}</td>
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
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">
            {request.requesterLabel} {"->"} {request.addresseeLabel}
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            상태 {request.status} · 생성 {formatDateTime(request.createdAt)}
          </p>
          {request.note ? <p className="mt-1 text-[12px] text-sam-fg">요청 메모: {request.note}</p> : null}
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
            className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[12px] text-sam-fg"
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
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">
            {call.roomTitle}
            <span className="ml-2 rounded bg-sam-surface-muted px-1.5 py-0.5 text-[11px] text-sam-fg">
              {call.sessionMode === "group" ? "그룹" : "1:1"}
            </span>
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            {call.callerLabel} {"->"} {call.peerLabel}
          </p>
          <p className="mt-1 text-[12px] text-sam-fg">
            {call.callKind} · {call.status} · {call.durationSeconds}초 · 참여 {call.participantCount}명
          </p>
        </div>
        <div className="text-[12px] text-sam-meta">{formatDateTime(call.startedAt)}</div>
      </div>
    </div>
  );
}

function ActiveCallRow({ call }: { call: AdminCommunityMessengerActiveCallSession }) {
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">
            {call.roomTitle}
            <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">
              {call.sessionMode === "group" ? "그룹" : "1:1"}
            </span>
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            시작자 {call.initiatorLabel} · {call.callKind} · {call.status}
          </p>
          <p className="mt-1 text-[12px] text-sam-fg">
            참여 {call.joinedCount}명 · 대기 {call.invitedCount}명 · 전체 {call.participantCount}명
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            {call.participants.map((participant) => `${participant.label}(${participant.status})`).join(", ")}
          </p>
        </div>
        <div className="text-right text-[12px] text-sam-meta">
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
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">
            {log.roomTitle}
            <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">강제 종료</span>
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            관리자 {log.actorLabel} · {log.beforeStatus} {"->"} {log.afterStatus}
          </p>
          {log.reasonCode ? (
            <p className="mt-1 text-[12px] text-sky-700">
              사유 코드: {log.reasonLabel} ({log.reasonCode})
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-sam-fg font-mono">{log.sessionId}</p>
          {log.note ? <p className="mt-1 text-[12px] text-amber-700">메모: {log.note}</p> : null}
        </div>
        <div className="text-right text-[12px] text-sam-meta">
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
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-sam-fg">
            {report.reportType} · {report.roomTitle}
          </p>
          <p className="mt-1 text-[12px] text-sam-muted">
            신고자 {report.reporterLabel} · 대상 {report.reportedUserLabel} · 상태 {report.status}
          </p>
          <p className="mt-1 text-[12px] text-sam-fg">
            사유 {report.reasonType}{report.reasonDetail ? ` · ${report.reasonDetail}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy === `report:${report.id}:reviewing`}
            onClick={() => void run("reviewing")}
            className="rounded border border-sam-border px-2.5 py-1.5 text-[12px] text-sam-fg"
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

function buildForceEndReasonStats(callAudits: AdminCommunityMessengerCallAuditLog[]) {
  const total = callAudits.length;
  const countMap = new Map<string, number>();
  for (const audit of callAudits) {
    const reasonCode = audit.reasonCode || "other";
    countMap.set(reasonCode, (countMap.get(reasonCode) ?? 0) + 1);
  }

  return COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => {
    const count = countMap.get(reason.code) ?? 0;
    return {
      code: reason.code,
      label: reason.label,
      count,
      share: total > 0 ? count / total : 0,
    };
  }).filter((item) => item.count > 0 || total === 0);
}

function buildForceEndTrendStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  periodFilter: "24h" | "7d" | "30d" | ""
) {
  const periods = periodFilter
    ? [periodFilter]
    : (["24h", "7d", "30d"] as Array<"24h" | "7d" | "30d">);

  return periods.map((period) => {
    const currentCount = callAudits.filter((audit) => matchesAuditPeriod(audit.createdAt, period)).length;
    const previousCount = callAudits.filter((audit) => matchesPreviousAuditPeriod(audit.createdAt, period)).length;
    const delta = currentCount - previousCount;
    return {
      key: period,
      label: period === "24h" ? "최근 24시간" : period === "7d" ? "최근 7일" : "최근 30일",
      currentCount,
      previousCount,
      delta,
      direction: delta > 0 ? ("up" as const) : delta < 0 ? ("down" as const) : ("flat" as const),
    };
  });
}

function buildForceEndAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[]) {
  const total = callAudits.length;
  const countMap = new Map<string, number>();
  for (const audit of callAudits) {
    const adminLabel = audit.actorLabel || "관리자 미상";
    countMap.set(adminLabel, (countMap.get(adminLabel) ?? 0) + 1);
  }

  return [...countMap.entries()]
    .map(([adminLabel, count]) => ({
      adminLabel,
      count,
      share: total > 0 ? count / total : 0,
    }))
    .sort((left, right) => right.count - left.count || left.adminLabel.localeCompare(right.adminLabel, "ko-KR"))
    .slice(0, 8);
}

function buildForceEndRoomTypeStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  roomTypeByRoomId: Map<string, "direct" | "private_group" | "open_group">
) {
  const total = callAudits.length;
  const countMap = new Map<string, number>([
    ["direct", 0],
    ["private_group", 0],
    ["open_group", 0],
    ["unknown", 0],
  ]);

  for (const audit of callAudits) {
    const roomType = roomTypeByRoomId.get(audit.roomId) ?? "unknown";
    countMap.set(roomType, (countMap.get(roomType) ?? 0) + 1);
  }

  return [
    { key: "direct", label: "1:1", count: countMap.get("direct") ?? 0 },
    { key: "private_group", label: "비공개 그룹", count: countMap.get("private_group") ?? 0 },
    { key: "open_group", label: "공개 그룹", count: countMap.get("open_group") ?? 0 },
    { key: "unknown", label: "미확인", count: countMap.get("unknown") ?? 0 },
  ].map((item) => ({
    ...item,
    share: total > 0 ? item.count / total : 0,
  }));
}

function buildForceEndRecurrenceAnalysis(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  roomTitleByRoomId: Map<string, string>,
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>
) {
  const roomCounts = new Map<string, { key: string; label: string; totalCount: number; latestAt: string }>();
  const callerCounts = new Map<string, { key: string; label: string; totalCount: number; latestAt: string }>();
  let resolvedCallerAuditCount = 0;

  for (const audit of callAudits) {
    const roomKey = audit.roomId || audit.sessionId;
    const existingRoom = roomCounts.get(roomKey);
    const roomLabel = roomTitleByRoomId.get(audit.roomId) || audit.roomTitle || "메신저 방";
    roomCounts.set(roomKey, {
      key: roomKey,
      label: roomLabel,
      totalCount: (existingRoom?.totalCount ?? 0) + 1,
      latestAt:
        existingRoom && new Date(existingRoom.latestAt).getTime() > new Date(audit.createdAt).getTime()
          ? existingRoom.latestAt
          : audit.createdAt,
    });

    const callLog = callLogBySessionId.get(audit.sessionId);
    const callerLabel = callLog?.callerLabel?.trim();
    if (!callerLabel) continue;
    resolvedCallerAuditCount += 1;
    const existingCaller = callerCounts.get(callerLabel);
    callerCounts.set(callerLabel, {
      key: callerLabel,
      label: callerLabel,
      totalCount: (existingCaller?.totalCount ?? 0) + 1,
      latestAt:
        existingCaller && new Date(existingCaller.latestAt).getTime() > new Date(audit.createdAt).getTime()
          ? existingCaller.latestAt
          : audit.createdAt,
    });
  }

  return {
    room: buildRecurrenceBucket([...roomCounts.values()], callAudits.length),
    caller: buildRecurrenceBucket([...callerCounts.values()], resolvedCallerAuditCount),
  };
}

function buildForceEndReasonRecurrenceStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  roomTitleByRoomId: Map<string, string>,
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>
) {
  const auditsByReason = new Map<string, AdminCommunityMessengerCallAuditLog[]>();
  for (const audit of callAudits) {
    const reasonCode = audit.reasonCode || "other";
    const list = auditsByReason.get(reasonCode) ?? [];
    list.push(audit);
    auditsByReason.set(reasonCode, list);
  }

  return COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => {
    const reasonAudits = auditsByReason.get(reason.code) ?? [];
    const recurrence = buildForceEndRecurrenceAnalysis(reasonAudits, roomTitleByRoomId, callLogBySessionId);
    return {
      code: reason.code,
      label: reason.label,
      totalCount: reasonAudits.length,
      roomRepeatedSubjects: recurrence.room.repeatedSubjects,
      roomRepeatedEvents: recurrence.room.repeatedEvents,
      roomRepeatShare: recurrence.room.share,
      callerRepeatedSubjects: recurrence.caller.repeatedSubjects,
      callerRepeatedEvents: recurrence.caller.repeatedEvents,
      callerRepeatShare: recurrence.caller.share,
    };
  })
    .filter((item) => item.totalCount > 0)
    .sort((left, right) => right.totalCount - left.totalCount || left.label.localeCompare(right.label, "ko-KR"));
}

function buildForceEndAdminEffectStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>
) {
  const audits = [...callAudits].sort((left, right) => {
    const diff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return diff !== 0 ? diff : left.id.localeCompare(right.id, "ko-KR");
  });
  const futureRoomCounts = new Map<string, number>();
  const futureCallerCounts = new Map<string, number>();
  const adminMap = new Map<
    string,
    {
      adminLabel: string;
      totalCount: number;
      roomFollowupCount: number;
      callerEvaluatedCount: number;
      callerFollowupCount: number;
    }
  >();

  for (let index = audits.length - 1; index >= 0; index -= 1) {
    const audit = audits[index];
    const adminLabel = audit.actorLabel || "관리자 미상";
    const roomKey = audit.roomId || audit.sessionId;
    const callerLabel = callLogBySessionId.get(audit.sessionId)?.callerLabel?.trim() || "";
    const hasFutureRoomRepeat = (futureRoomCounts.get(roomKey) ?? 0) > 0;
    const hasFutureCallerRepeat = callerLabel ? (futureCallerCounts.get(callerLabel) ?? 0) > 0 : false;
    const current = adminMap.get(adminLabel) ?? {
      adminLabel,
      totalCount: 0,
      roomFollowupCount: 0,
      callerEvaluatedCount: 0,
      callerFollowupCount: 0,
    };

    current.totalCount += 1;
    if (hasFutureRoomRepeat) current.roomFollowupCount += 1;
    if (callerLabel) {
      current.callerEvaluatedCount += 1;
      if (hasFutureCallerRepeat) current.callerFollowupCount += 1;
    }
    adminMap.set(adminLabel, current);

    futureRoomCounts.set(roomKey, (futureRoomCounts.get(roomKey) ?? 0) + 1);
    if (callerLabel) {
      futureCallerCounts.set(callerLabel, (futureCallerCounts.get(callerLabel) ?? 0) + 1);
    }
  }

  return [...adminMap.values()]
    .map((item) => ({
      ...item,
      roomSuppressionRate: item.totalCount > 0 ? (item.totalCount - item.roomFollowupCount) / item.totalCount : 0,
      callerSuppressionRate:
        item.callerEvaluatedCount > 0
          ? (item.callerEvaluatedCount - item.callerFollowupCount) / item.callerEvaluatedCount
          : 0,
    }))
    .sort(
      (left, right) =>
        right.roomSuppressionRate - left.roomSuppressionRate ||
        right.callerSuppressionRate - left.callerSuppressionRate ||
        right.totalCount - left.totalCount ||
        left.adminLabel.localeCompare(right.adminLabel, "ko-KR")
    )
    .slice(0, 8);
}

function buildForceEndHeatmapStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>
) {
  const totalMatrix = createEmptyHeatmapMatrix();
  const recurrenceMatrix = createEmptyHeatmapMatrix();
  const audits = [...callAudits].sort((left, right) => {
    const diff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return diff !== 0 ? diff : left.id.localeCompare(right.id, "ko-KR");
  });
  const futureRoomCounts = new Map<string, number>();
  const futureCallerCounts = new Map<string, number>();

  for (let index = audits.length - 1; index >= 0; index -= 1) {
    const audit = audits[index];
    const date = new Date(audit.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const weekday = date.getDay();
    const hour = date.getHours();
    totalMatrix[weekday][hour] += 1;

    const roomKey = audit.roomId || audit.sessionId;
    const callerLabel = callLogBySessionId.get(audit.sessionId)?.callerLabel?.trim() || "";
    const hasFutureRoomRepeat = (futureRoomCounts.get(roomKey) ?? 0) > 0;
    const hasFutureCallerRepeat = callerLabel ? (futureCallerCounts.get(callerLabel) ?? 0) > 0 : false;
    if (hasFutureRoomRepeat || hasFutureCallerRepeat) {
      recurrenceMatrix[weekday][hour] += 1;
    }

    futureRoomCounts.set(roomKey, (futureRoomCounts.get(roomKey) ?? 0) + 1);
    if (callerLabel) {
      futureCallerCounts.set(callerLabel, (futureCallerCounts.get(callerLabel) ?? 0) + 1);
    }
  }

  return {
    totalMatrix,
    recurrenceMatrix,
    maxTotalCount: getHeatmapMaxCount(totalMatrix),
    maxRecurrenceCount: getHeatmapMaxCount(recurrenceMatrix),
    topForceEndSlots: getTopHeatmapSlots(totalMatrix),
    topRecurrenceSlots: getTopHeatmapSlots(recurrenceMatrix),
  };
}

function buildForceEndReasonHeatmapStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>
) {
  const auditsByReason = new Map<string, AdminCommunityMessengerCallAuditLog[]>();
  for (const audit of callAudits) {
    const reasonCode = audit.reasonCode || "other";
    const list = auditsByReason.get(reasonCode) ?? [];
    list.push(audit);
    auditsByReason.set(reasonCode, list);
  }

  return COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => {
    const reasonAudits = auditsByReason.get(reason.code) ?? [];
    const heatmap = buildForceEndHeatmapStats(reasonAudits, callLogBySessionId);
    const recurrenceCount = heatmap.recurrenceMatrix.reduce((sum, row) => sum + row.reduce((rowSum, count) => rowSum + count, 0), 0);
    return {
      code: reason.code,
      label: reason.label,
      totalCount: reasonAudits.length,
      recurrenceCount,
      recurrenceShare: reasonAudits.length > 0 ? recurrenceCount / reasonAudits.length : 0,
      matrix: heatmap.totalMatrix,
      maxCount: heatmap.maxTotalCount,
      topSlots: heatmap.topForceEndSlots,
    };
  })
    .filter((item) => item.totalCount > 0)
    .sort((left, right) => right.totalCount - left.totalCount || left.label.localeCompare(right.label, "ko-KR"));
}

function buildForceEndReasonAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[]) {
  const auditsByReason = new Map<string, AdminCommunityMessengerCallAuditLog[]>();
  for (const audit of callAudits) {
    const reasonCode = audit.reasonCode || "other";
    const list = auditsByReason.get(reasonCode) ?? [];
    list.push(audit);
    auditsByReason.set(reasonCode, list);
  }

  return COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => {
    const reasonAudits = auditsByReason.get(reason.code) ?? [];
    const adminCounts = new Map<string, number>();
    for (const audit of reasonAudits) {
      const adminLabel = audit.actorLabel || "관리자 미상";
      adminCounts.set(adminLabel, (adminCounts.get(adminLabel) ?? 0) + 1);
    }
    return {
      code: reason.code,
      label: reason.label,
      totalCount: reasonAudits.length,
      uniqueAdminCount: adminCounts.size,
      topAdmins: [...adminCounts.entries()]
        .map(([adminLabel, count]) => ({
          adminLabel,
          count,
          share: reasonAudits.length > 0 ? count / reasonAudits.length : 0,
        }))
        .sort((left, right) => right.count - left.count || left.adminLabel.localeCompare(right.adminLabel, "ko-KR"))
        .slice(0, 4),
    };
  })
    .filter((item) => item.totalCount > 0)
    .sort((left, right) => right.totalCount - left.totalCount || left.label.localeCompare(right.label, "ko-KR"));
}

function buildRecurrenceBucket(
  items: Array<{ key: string; label: string; totalCount: number; latestAt: string }>,
  analyzedCount: number
) {
  const repeatedItems = items
    .filter((item) => item.totalCount >= 2)
    .sort(
      (left, right) =>
        right.totalCount - left.totalCount ||
        new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime() ||
        left.label.localeCompare(right.label, "ko-KR")
    );
  const repeatedEvents = repeatedItems.reduce((sum, item) => sum + (item.totalCount - 1), 0);

  return {
    analyzedCount,
    repeatedSubjects: repeatedItems.length,
    repeatedEvents,
    share: analyzedCount > 0 ? repeatedEvents / analyzedCount : 0,
    topItems: repeatedItems.slice(0, 5).map((item) => ({
      ...item,
      repeatCount: item.totalCount - 1,
    })),
  };
}

function createEmptyHeatmapMatrix() {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

function getHeatmapMaxCount(matrix: number[][]) {
  return matrix.reduce((max, row) => Math.max(max, ...row), 0);
}

function getTopHeatmapSlots(matrix: number[][]) {
  return matrix
    .flatMap((row, weekday) =>
      row.map((count, hour) => ({
        label: `${FORCE_END_HEATMAP_WEEKDAYS[weekday]} ${String(hour).padStart(2, "0")}:00`,
        count,
        weekday,
        hour,
      }))
    )
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.weekday - right.weekday || left.hour - right.hour)
    .slice(0, 5)
    .map(({ label, count }) => ({ label, count }));
}

function getHeatmapCellStyle(count: number, maxCount: number, tone: "red" | "amber") {
  if (count <= 0 || maxCount <= 0) {
    return { backgroundColor: "#f3f4f6" };
  }
  const alpha = 0.18 + (count / maxCount) * 0.72;
  return {
    backgroundColor: tone === "red" ? `rgba(239, 68, 68, ${alpha})` : `rgba(245, 158, 11, ${alpha})`,
  };
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
  const windowMs = getAuditPeriodWindowMs(period);
  return diff >= 0 && diff <= windowMs;
}

function matchesPreviousAuditPeriod(value: string, period: "24h" | "7d" | "30d") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const now = Date.now();
  const diff = now - date.getTime();
  const windowMs = getAuditPeriodWindowMs(period);
  return diff > windowMs && diff <= windowMs * 2;
}

function getAuditPeriodWindowMs(period: "24h" | "7d" | "30d") {
  return period === "24h"
    ? 24 * 60 * 60 * 1000
    : period === "7d"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
}
