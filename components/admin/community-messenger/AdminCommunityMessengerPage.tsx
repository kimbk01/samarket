"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS } from "@/lib/admin-community-messenger/call-force-end-reasons";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AdminCommunityMessengerActiveCallSession,
  AdminCommunityMessengerCallAuditLog,
  AdminCommunityMessengerCallLog,
  AdminCommunityMessengerDashboard,
  AdminCommunityMessengerReport,
  AdminCommunityMessengerRoomSummary,
} from "@/lib/admin-community-messenger/service";
import type { CommunityMessengerRoomStatus } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { cmForceEndReasonLabel, useCmAdminLabels } from "./useCmAdminLabels";
import type { CmAdminTranslate } from "./useCmAdminLabels";

const ADMIN_MESSENGER_OVERVIEW_SILENT_FLIGHT = "admin:community-messenger:overview:silent";
/** Coalesce burst postgres_changes into one overview GET. */
const REALTIME_OVERVIEW_DEBOUNCE_MS = 900;

type DashboardResponse = AdminCommunityMessengerDashboard & { ok?: boolean };

export function AdminCommunityMessengerPage() {
  const {
    t,
    formatDateTime,
    roomTypeLabel,
    forceEndReasonOptions,
    weekdays,
    heatmapHours,
    heatmapHourHeader,
    heatmapCellTitle,
    adminUnknownLabel,
    defaultRoomLabel,
  } = useCmAdminLabels();
  const { language } = useI18n();
  const contactPolicyTitle = language === "en" ? "Contact policy" : "Contact 정책";
  const contactPolicyNotice =
    language === "en"
      ? "The friend request (pending) model is retired. User contacts use viewer-local saves. Legacy pending rows may remain in the DB but are not reviewed, accepted, or rejected in admin UI."
      : "친구 요청(pending) 모델은 종료되었습니다. 사용자 Contact는 viewer-local 저장 방식입니다. legacy pending 데이터는 DB에 남을 수 있으나 관리자 UI에서 수락·거절·검토하지 않습니다.";
  const searchParams = useSearchParams();
  const initialListQueryAppliedRef = useRef(false);
  const [data, setData] = useState<AdminCommunityMessengerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomStatusFilter, setRoomStatusFilter] = useState<CommunityMessengerRoomStatus | "">("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<"direct" | "private_group" | "open_group" | "">("");
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
          requests: [],
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
        refreshTimeoutRef.current = null;
        void runSingleFlight(ADMIN_MESSENGER_OVERVIEW_SILENT_FLIGHT, () => refresh(true));
      }, REALTIME_OVERVIEW_DEBOUNCE_MS);
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
  }, [analyticsAuditsByReason, forceEndAnalysisPeriodFilter, t]);

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
    return buildForceEndReasonStats(filteredAnalyticsAudits, t);
  }, [filteredAnalyticsAudits, t]);

  const filteredForceEndTrendStats = useMemo(() => {
    return buildForceEndTrendStats(analyticsAuditsByReason, forceEndAnalysisPeriodFilter, t);
  }, [analyticsAuditsByReason, forceEndAnalysisPeriodFilter, t]);

  const filteredForceEndAdminStats = useMemo(() => {
    return buildForceEndAdminStats(filteredAnalyticsAudits, t);
  }, [filteredAnalyticsAudits, t]);

  const filteredForceEndRoomTypeStats = useMemo(() => {
    return buildForceEndRoomTypeStats(filteredAnalyticsAudits, roomTypeByRoomId, t);
  }, [filteredAnalyticsAudits, roomTypeByRoomId]);

  const filteredForceEndRecurrenceAnalysis = useMemo(() => {
    return buildForceEndRecurrenceAnalysis(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId, t);
  }, [callLogBySessionId, filteredAnalyticsAudits, roomTitleByRoomId, t]);

  const filteredForceEndReasonRecurrenceStats = useMemo(() => {
    return buildForceEndReasonRecurrenceStats(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId, t);
  }, [callLogBySessionId, filteredAnalyticsAudits, roomTitleByRoomId]);

  const filteredForceEndAdminEffectStats = useMemo(() => {
    return buildForceEndAdminEffectStats(filteredAnalyticsAudits, callLogBySessionId, t);
  }, [callLogBySessionId, filteredAnalyticsAudits, t]);

  const filteredForceEndHeatmapStats = useMemo(() => {
    return buildForceEndHeatmapStats(filteredAnalyticsAudits, callLogBySessionId, weekdays, t);
  }, [callLogBySessionId, filteredAnalyticsAudits, weekdays, t]);

  const filteredForceEndReasonHeatmapStats = useMemo(() => {
    return buildForceEndReasonHeatmapStats(filteredAnalyticsAudits, callLogBySessionId, weekdays, t);
  }, [callLogBySessionId, filteredAnalyticsAudits, weekdays, t]);

  const filteredForceEndReasonAdminStats = useMemo(() => {
    return buildForceEndReasonAdminStats(filteredAnalyticsAudits, t);
  }, [filteredAnalyticsAudits, t]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_cm_page_overview_title"
        descriptionKey="admin_cm_page_overview_desc"
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label={t("admin_cm_stat_total_rooms")} value={data?.stats.totalRooms ?? 0} helper={t("admin_cm_stat_total_rooms_helper")} />
        <StatCard label={t("admin_cm_stat_active_rooms")} value={data?.stats.activeRooms ?? 0} helper={t("admin_cm_stat_active_rooms_helper")} />
        <StatCard label={t("admin_cm_stat_blocked_archived")} value={(data?.stats.blockedRooms ?? 0) + (data?.stats.archivedRooms ?? 0)} helper="blocked + archived" />
        <StatCard label={t("admin_cm_stat_private_groups")} value={data?.stats.privateGroupRooms ?? 0} helper="friend invite" />
        <StatCard label={t("admin_cm_stat_open_groups")} value={data?.stats.openGroupRooms ?? 0} helper="password join" />
        <StatCard label={t("admin_cm_stat_active_calls")} value={data?.stats.activeCallSessions ?? 0} helper="ringing + active" />
        <StatCard label={t("admin_cm_stat_active_group_calls")} value={data?.stats.activeGroupCallSessions ?? 0} helper="group sessions" />
        <StatCard label={t("admin_cm_stat_open_reports")} value={data?.stats.openReports ?? 0} helper="received + reviewing" />
        <StatCard label={t("admin_cm_stat_force_end_total")} value={data?.stats.forceEndTotal ?? 0} helper={t("admin_cm_stat_force_end_total_helper")} />
      </div>

      <AdminCard titleKey="admin_cm_card_force_end_analysis">
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={forceEndReasonFilter}
            onChange={(e) => setForceEndReasonFilter(e.target.value)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_filter_all_reason_codes")}</option>
            {forceEndReasonOptions.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
          <select
            value={forceEndAnalysisPeriodFilter}
            onChange={(e) => setForceEndAnalysisPeriodFilter(e.target.value as "24h" | "7d" | "30d" | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_period_all")}</option>
            <option value="24h">{t("admin_cm_period_24h")}</option>
            <option value="7d">{t("admin_cm_period_7d")}</option>
            <option value="30d">{t("admin_cm_period_30d")}</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setForceEndReasonFilter("");
              setForceEndAnalysisPeriodFilter("");
            }}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          >
            {t("admin_cm_filter_reset")}
          </button>
          <div className="flex items-center sam-text-helper text-sam-muted">{t("admin_cm_common_analysis_target", { count: filteredAnalyticsAudits.length })}</div>
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_force_end_kpi">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredForceEndReasonStats.map((item) => (
            <ForceEndReasonKpiCard key={item.code} label={item.label} code={item.code} count={item.count} share={item.share} />
          ))}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_force_end_trend">
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

      <AdminCard titleKey="admin_cm_card_force_end_by_admin">
        <div className="space-y-2">
          {filteredForceEndAdminStats.length === 0 ? (
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_force_end_stats")}</div>
          ) : (
            filteredForceEndAdminStats.map((item) => (
              <ForceEndAdminRow key={item.adminLabel} adminLabel={item.adminLabel} count={item.count} share={item.share} />
            ))
          )}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_force_end_by_room_type">
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

      <AdminCard titleKey="admin_cm_card_force_end_recurrence">
        <div className="grid gap-3 md:grid-cols-2">
          <ForceEndRecurrenceSummaryCard
            label={t("admin_cm_recurrence_rooms")}
            subjectCount={filteredForceEndRecurrenceAnalysis.room.repeatedSubjects}
            repeatCount={filteredForceEndRecurrenceAnalysis.room.repeatedEvents}
            analyzedCount={filteredForceEndRecurrenceAnalysis.room.analyzedCount}
            share={filteredForceEndRecurrenceAnalysis.room.share}
            helper={t("admin_cm_recurrence_rooms_helper")}
          />
          <ForceEndRecurrenceSummaryCard
            label={t("admin_cm_recurrence_callers")}
            subjectCount={filteredForceEndRecurrenceAnalysis.caller.repeatedSubjects}
            repeatCount={filteredForceEndRecurrenceAnalysis.caller.repeatedEvents}
            analyzedCount={filteredForceEndRecurrenceAnalysis.caller.analyzedCount}
            share={filteredForceEndRecurrenceAnalysis.caller.share}
            helper={t("admin_cm_recurrence_callers_helper")}
          />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_cm_repeat_rooms_top")}</p>
            {filteredForceEndRecurrenceAnalysis.room.topItems.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-6 text-center sam-text-body-secondary text-sam-muted">
                {t("admin_cm_empty_repeat_rooms")}
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
            <p className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_cm_repeat_callers_top")}</p>
            {filteredForceEndRecurrenceAnalysis.caller.topItems.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-6 text-center sam-text-body-secondary text-sam-muted">
                {t("admin_cm_empty_repeat_callers")}
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

      <AdminCard titleKey="admin_cm_card_force_end_reason_recurrence">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredForceEndReasonRecurrenceStats.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center sam-text-body-secondary text-sam-muted md:col-span-2 xl:col-span-3">
              {t("admin_cm_empty_reason_recurrence")}
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

      <AdminCard titleKey="admin_cm_card_force_end_admin_effect">
        <div className="space-y-2">
          {filteredForceEndAdminEffectStats.length === 0 ? (
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_recurrence_data")}</div>
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

      <AdminCard titleKey="admin_cm_card_force_end_heatmap">
        <div className="grid gap-4 xl:grid-cols-2">
          <ForceEndHeatmapCard
            title={t("admin_cm_heatmap_force_end")}
            description={t("admin_cm_heatmap_force_end_desc")}
            matrix={filteredForceEndHeatmapStats.totalMatrix}
            maxCount={filteredForceEndHeatmapStats.maxTotalCount}
            topSlots={filteredForceEndHeatmapStats.topForceEndSlots}
            tone="red"
          />
          <ForceEndHeatmapCard
            title={t("admin_cm_heatmap_recurrence")}
            description={t("admin_cm_heatmap_recurrence_desc")}
            matrix={filteredForceEndHeatmapStats.recurrenceMatrix}
            maxCount={filteredForceEndHeatmapStats.maxRecurrenceCount}
            topSlots={filteredForceEndHeatmapStats.topRecurrenceSlots}
            tone="amber"
          />
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_force_end_reason_heatmap">
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredForceEndReasonHeatmapStats.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center sam-text-body-secondary text-sam-muted xl:col-span-2">
              {t("admin_cm_empty_reason_heatmap")}
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

      <AdminCard titleKey="admin_cm_card_force_end_reason_admin">
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredForceEndReasonAdminStats.length === 0 ? (
            <div className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center sam-text-body-secondary text-sam-muted xl:col-span-2">
              {t("admin_cm_empty_reason_admin")}
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

      <AdminCard titleKey="admin_cm_card_room_list">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin_cm_placeholder_room_search")}
            className="min-w-[220px] rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <select
            value={roomStatusFilter}
            onChange={(e) => setRoomStatusFilter(e.target.value as CommunityMessengerRoomStatus | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_filter_all_status")}</option>
            <option value="active">active</option>
            <option value="blocked">blocked</option>
            <option value="archived">archived</option>
          </select>
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value as "direct" | "private_group" | "open_group" | "")}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_cm_filter_all_types")}</option>
            <option value="direct">1:1</option>
            <option value="private_group">{t("admin_cm_room_type_private_group")}</option>
            <option value="open_group">{t("admin_cm_room_type_open_group")}</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          >
            {t("admin_cm_common_refresh")}
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</div>
        ) : filteredRooms.length === 0 ? (
          <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_rooms")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] sam-text-body">
              <thead>
                <tr className="border-b border-sam-border text-left text-sam-muted">
                  <th className="px-3 py-2">{t("admin_cm_th_room")}</th>
                  <th className="px-3 py-2">{t("admin_cm_th_type")}</th>
                  <th className="px-3 py-2">{t("admin_cm_th_status")}</th>
                  <th className="px-3 py-2">{t("admin_cm_th_creator")}</th>
                  <th className="px-3 py-2">{t("admin_cm_th_participants")}</th>
                  <th className="px-3 py-2">{t("admin_cm_th_last_message")}</th>
                  <th className="px-3 py-2">{t("admin_cm_th_last_time")}</th>
                  <th className="px-3 py-2 text-right">{t("admin_cm_th_detail")}</th>
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

      <AdminCard title={contactPolicyTitle}>
        <p className="sam-text-body text-sam-fg">{contactPolicyNotice}</p>
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard titleKey="admin_cm_card_active_calls">
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={callQuery}
              onChange={(e) => setCallQuery(e.target.value)}
              placeholder={t("admin_cm_placeholder_call_search")}
              className="min-w-[220px] rounded border border-sam-border px-3 py-2 sam-text-body"
            />
            <select
              value={callModeFilter}
              onChange={(e) => setCallModeFilter(e.target.value as "direct" | "group" | "")}
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">{t("admin_cm_filter_all_call_types")}</option>
              <option value="direct">1:1</option>
              <option value="group">{t("admin_cm_session_mode_group")}</option>
            </select>
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
              <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_active_calls")}</div>
            ) : (
              filteredActiveCalls.map((call) => <ActiveCallRow key={call.id} call={call} />)
            )}
          </div>
        </AdminCard>

        <AdminCard titleKey="admin_cm_card_recent_calls">
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
          </div>
          <div className="space-y-2">
            {filteredCalls.length === 0 ? (
              <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_call_logs")}</div>
            ) : (
              filteredCalls.map((call) => <CallRow key={call.id} call={call} />)
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard titleKey="admin_cm_card_force_end_audit">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder={t("admin_cm_placeholder_audit_search")}
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
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_audit_logs")}</div>
          ) : (
            filteredCallAudits.map((log) => <CallAuditRow key={log.id} log={log} />)
          )}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_recent_reports">
        <div className="space-y-2">
          {(data?.reports ?? []).length === 0 ? (
            <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_reports")}</div>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="sam-text-body-secondary text-sam-muted">{label}</p>
      <p className="mt-2 sam-text-hero font-semibold text-sam-fg">{value}</p>
      <p className="mt-1 sam-text-helper text-sam-meta">{helper}</p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body-secondary text-sam-muted">{label}</p>
          <p className="mt-1 font-mono sam-text-xxs text-sam-meta">{code}</p>
        </div>
        <p className="sam-text-hero font-semibold text-sam-fg">{count}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
        <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }} />
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_cm_common_share_of_force_end", { percent })}</p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
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
          <p className="sam-text-body-secondary text-sam-muted">{label}</p>
          <p className="mt-2 sam-text-hero font-semibold text-sam-fg">{currentCount}</p>
        </div>
        <span className={`rounded px-2 py-1 sam-text-helper font-medium ${toneClass}`}>{deltaLabel}</span>
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_cm_common_vs_previous_period", { count: previousCount })}</p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate sam-text-body font-medium text-sam-fg">{adminLabel}</p>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_cm_common_share_of_force_end", { percent })}</p>
        </div>
        <div className="text-right">
          <p className="sam-text-hero font-semibold text-sam-fg">{count}</p>
          <p className="sam-text-xxs text-sam-meta">{t("admin_cm_label_count")}</p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="sam-text-body-secondary text-sam-muted">{label}</p>
      <p className="mt-2 sam-text-hero font-semibold text-sam-fg">{count}</p>
      <div className="mt-3 h-2 rounded-full bg-sam-surface-muted">
        <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.max(percent, count > 0 ? 8 : 0)}%` }} />
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_cm_common_share_of_force_end", { percent })}</p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const percent = Math.round(share * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body-secondary text-sam-muted">{label}</p>
          <p className="mt-2 sam-text-hero font-semibold text-sam-fg">{subjectCount}</p>
        </div>
        <span className="rounded bg-amber-50 px-2 py-1 sam-text-helper font-medium text-amber-700">{percent}%</span>
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">{helper}</p>
      <p className="mt-1 sam-text-helper text-sam-muted">
        {t("admin_cm_common_repeat_analyzed", { repeat: repeatCount, analyzed: analyzedCount })}
      </p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate sam-text-body font-medium text-sam-fg">{label}</p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_total_repeat", { total: totalCount, repeat: repeatCount })}
          </p>
        </div>
        <div className="text-right sam-text-helper text-sam-meta">{formatDateTime(latestAt)}</div>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const roomPercent = Math.round(roomRepeatShare * 100);
  const callerPercent = Math.round(callerRepeatShare * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body-secondary text-sam-muted">{label}</p>
          <p className="mt-1 font-mono sam-text-xxs text-sam-meta">{code}</p>
        </div>
        <div className="text-right">
          <p className="sam-text-hero font-semibold text-sam-fg">{totalCount}</p>
          <p className="sam-text-xxs text-sam-meta">{t("admin_cm_common_total_force_end")}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-3 sam-text-helper">
            <span className="text-sam-muted">{t("admin_cm_room_recurrence")}</span>
            <span className="font-medium text-sam-fg">{roomPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(roomPercent, roomRepeatedEvents > 0 ? 8 : 0)}%` }} />
          </div>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_room_repeat", { rooms: roomRepeatedSubjects, events: roomRepeatedEvents })}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 sam-text-helper">
            <span className="text-sam-muted">{t("admin_cm_caller_recurrence")}</span>
            <span className="font-medium text-sam-fg">{callerPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(callerPercent, callerRepeatedEvents > 0 ? 8 : 0)}%` }} />
          </div>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_caller_repeat", { callers: callerRepeatedSubjects, events: callerRepeatedEvents })}
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const roomPercent = Math.round(roomSuppressionRate * 100);
  const callerPercent = Math.round(callerSuppressionRate * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate sam-text-body font-medium text-sam-fg">{adminLabel}</p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_total_force_end")} · {t("admin_cm_common_count", { count: totalCount })}
          </p>
        </div>
        <div className="text-right sam-text-helper text-sam-meta">
          <div>{t("admin_cm_common_room_followup", { count: roomFollowupCount })}</div>
          <div className="mt-1">{t("admin_cm_common_caller_followup", { count: callerFollowupCount })}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-3 sam-text-helper">
            <span className="text-sam-muted">{t("admin_cm_room_suppression")}</span>
            <span className="font-medium text-sam-fg">{roomPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(roomPercent, totalCount > 0 ? 8 : 0)}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 sam-text-helper">
            <span className="text-sam-muted">{t("admin_cm_caller_suppression")}</span>
            <span className="font-medium text-sam-fg">{callerPercent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sam-surface-muted">
            <div
              className="h-2 rounded-full bg-sky-500"
              style={{ width: `${Math.max(callerPercent, callerEvaluatedCount > 0 ? 8 : 0)}%` }}
            />
          </div>
          <p className="mt-1 sam-text-xxs text-sam-meta">{t("admin_cm_common_caller_evaluated", { count: callerEvaluatedCount })}</p>
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
  const { t, weekdays, heatmapHours, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="sam-text-body font-medium text-sam-fg">{title}</p>
      <p className="mt-1 sam-text-helper text-sam-muted">{description}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left sam-text-xxs font-medium text-sam-meta">{t("admin_cm_weekday_header")}</th>
              {heatmapHours.map((hourLabel, hour) => (
                <th key={hourLabel} className="px-1 py-1 text-center sam-text-xxs font-medium text-sam-meta">
                  {heatmapHourHeader(hour)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekdays.map((weekday, dayIndex) => (
              <tr key={weekday}>
                <th className="px-2 py-1 text-left sam-text-xxs font-medium text-sam-muted">{weekday}</th>
                {matrix[dayIndex].map((count, hour) => (
                  <td
                    key={`${weekday}-${hour}`}
                    title={heatmapCellTitle(weekday, hour, count)}
                    className="h-8 min-w-8 rounded text-center sam-text-xxs font-medium text-sam-fg"
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
      <div className="mt-3 flex items-center gap-2 sam-text-xxs text-sam-muted">
        <span className="inline-block h-2 w-8 rounded bg-sam-surface-muted" />
        <span>{t("admin_cm_heatmap_low")}</span>
        <span className={`inline-block h-2 w-8 rounded ${tone === "red" ? "bg-red-400" : "bg-amber-400"}`} />
        <span>{t("admin_cm_heatmap_high")}</span>
      </div>
      <div className="mt-3 space-y-1">
        <p className="sam-text-helper font-medium text-sam-fg">{t("admin_cm_heatmap_peak_hours")}</p>
        {topSlots.length === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("admin_cm_heatmap_no_data")}</p>
        ) : (
          topSlots.map((slot) => (
            <p key={slot.label} className="sam-text-helper text-sam-muted">
              {t("admin_cm_common_slot_line", { label: slot.label, count: slot.count })}
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
  const { t, weekdays, heatmapHours, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  const recurrencePercent = Math.round(recurrenceShare * 100);
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body font-medium text-sam-fg">{label}</p>
          <p className="mt-1 font-mono sam-text-xxs text-sam-meta">{code}</p>
        </div>
        <div className="text-right">
          <p className="sam-text-hero font-semibold text-sam-fg">{totalCount}</p>
          <p className="sam-text-xxs text-sam-meta">{t("admin_cm_common_total_force_end")}</p>
        </div>
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">
        {t("admin_cm_common_recurrence_line", { count: recurrenceCount, percent: recurrencePercent })}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left sam-text-xxs font-medium text-sam-meta">{t("admin_cm_weekday_header")}</th>
              {heatmapHours.map((hourLabel, hour) => (
                <th key={hourLabel} className="px-1 py-1 text-center sam-text-xxs font-medium text-sam-meta">
                  {heatmapHourHeader(hour)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekdays.map((weekday, dayIndex) => (
              <tr key={`${code}:${weekday}`}>
                <th className="px-2 py-1 text-left sam-text-xxs font-medium text-sam-muted">{weekday}</th>
                {matrix[dayIndex].map((count, hour) => (
                  <td
                    key={`${code}:${weekday}-${hour}`}
                    title={heatmapCellTitle(weekday, hour, count)}
                    className="h-8 min-w-8 rounded text-center sam-text-xxs font-medium text-sam-fg"
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
        <p className="sam-text-helper font-medium text-sam-fg">{t("admin_cm_heatmap_peak_hours")}</p>
        {topSlots.length === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("admin_cm_heatmap_no_data")}</p>
        ) : (
          topSlots.map((slot) => (
            <p key={`${code}:${slot.label}`} className="sam-text-helper text-sam-muted">
              {t("admin_cm_common_slot_line", { label: slot.label, count: slot.count })}
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body font-medium text-sam-fg">{label}</p>
          <p className="mt-1 font-mono sam-text-xxs text-sam-meta">{code}</p>
        </div>
        <div className="text-right">
          <p className="sam-text-hero font-semibold text-sam-fg">{totalCount}</p>
          <p className="sam-text-xxs text-sam-meta">{t("admin_cm_common_total_force_end")}</p>
        </div>
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_cm_common_operators_count", { count: uniqueAdminCount })}</p>
      <div className="mt-4 space-y-2">
        {topAdmins.length === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("admin_cm_empty_operator_stats")}</p>
        ) : (
          topAdmins.map((item) => {
            const percent = Math.round(item.share * 100);
            return (
              <div key={`${code}:${item.adminLabel}`} className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate sam-text-body-secondary font-medium text-sam-fg">{item.adminLabel}</p>
                    <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_cm_common_reason_share", { percent })}</p>
                  </div>
                  <div className="text-right">
                    <p className="sam-text-page-title font-semibold text-sam-fg">{item.count}</p>
                    <p className="sam-text-xxs text-sam-meta">{t("admin_cm_label_count")}</p>
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
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <tr className="border-b border-sam-border-soft align-top">
      <td className="px-3 py-3">
        <div className="font-medium text-sam-fg">{room.title}</div>
        <div className="mt-1 font-mono sam-text-helper text-sam-meta">{room.id}</div>
        {room.adminNote ? <div className="mt-1 sam-text-helper text-amber-700">{t("admin_cm_common_note", { text: room.adminNote })}</div> : null}
      </td>
      <td className="px-3 py-3 text-sam-fg">
        {roomTypeLabel(room.roomType === "open_group" ? "open_group" : room.roomType === "private_group" ? "private_group" : "direct")}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-sam-surface-muted px-2 py-1 sam-text-helper text-sam-fg">{room.roomStatus}</span>
          {room.isReadonly ? (
            <span className="rounded bg-amber-50 px-2 py-1 sam-text-helper text-amber-700">readonly</span>
          ) : null}
          {room.roomType === "open_group" ? (
            <span className="rounded bg-sky-50 px-2 py-1 sam-text-helper text-sky-700">
              {room.isDiscoverable ? "discoverable" : "hidden"}
            </span>
          ) : null}
          {room.requiresPassword ? (
            <span className="rounded bg-sam-surface-muted px-2 py-1 sam-text-helper text-sam-fg">password</span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-sam-fg">{room.createdByLabel}</td>
      <td className="px-3 py-3 text-sam-fg">
        <div>{t("admin_cm_common_members", { count: room.memberCount })}</div>
        <div className="mt-1 sam-text-helper text-sam-muted">{room.memberLabels.join(", ")}</div>
      </td>
      <td className="px-3 py-3 text-sam-fg">{room.lastMessage}</td>
      <td className="px-3 py-3 whitespace-nowrap text-sam-muted">{formatDateTime(room.lastMessageAt)}</td>
      <td className="px-3 py-3 text-right">
        <Link
          href={`/admin/chats/messenger/${encodeURIComponent(room.id)}`}
          className="text-signature hover:underline"
        >
          {t("admin_cm_action_view_detail")}
        </Link>
      </td>
    </tr>
  );
}

function CallRow({ call }: { call: AdminCommunityMessengerCallLog }) {
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body font-medium text-sam-fg">
            {call.roomTitle}
            <span className="ml-2 rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-fg">
              {call.sessionMode === "group" ? t("admin_cm_session_mode_group") : t("admin_cm_session_mode_direct")}
            </span>
          </p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {call.callerLabel} {"->"} {call.peerLabel}
          </p>
          <p className="mt-1 sam-text-helper text-sam-fg">
            {t("admin_cm_common_call_duration", { kind: call.callKind, status: call.status, seconds: call.durationSeconds, count: call.participantCount })}
          </p>
        </div>
        <div className="sam-text-helper text-sam-meta">{formatDateTime(call.startedAt)}</div>
      </div>
    </div>
  );
}

function ActiveCallRow({ call }: { call: AdminCommunityMessengerActiveCallSession }) {
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body font-medium text-sam-fg">
            {call.roomTitle}
            <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 sam-text-xxs text-sky-700">
              {call.sessionMode === "group" ? t("admin_cm_session_mode_group") : t("admin_cm_session_mode_direct")}
            </span>
          </p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_initiator", { name: call.initiatorLabel })} · {call.callKind} · {call.status}
          </p>
          <p className="mt-1 sam-text-helper text-sam-fg">
            {t("admin_cm_common_participants_joined", { joined: call.joinedCount, invited: call.invitedCount, total: call.participantCount })}
          </p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {call.participants.map((participant) => `${participant.label}(${participant.status})`).join(", ")}
          </p>
        </div>
        <div className="text-right sam-text-helper text-sam-meta">
          <div>{formatDateTime(call.startedAt)}</div>
          <div className="mt-1">
            <Link
              href={`/admin/chats/messenger/${encodeURIComponent(call.roomId)}`}
              className="text-signature hover:underline"
            >
              {t("admin_cm_action_room_detail")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallAuditRow({ log }: { log: AdminCommunityMessengerCallAuditLog }) {
  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();
  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body font-medium text-sam-fg">
            {log.roomTitle}
            <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 sam-text-xxs text-red-700">{t("admin_cm_force_end_badge")}</span>
          </p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_admin_actor", { name: log.actorLabel })} · {log.beforeStatus} {"->"} {log.afterStatus}
          </p>
          {log.reasonCode ? (
            <p className="mt-1 sam-text-helper text-sky-700">
              {t("admin_cm_common_reason_code", { label: log.reasonLabel, code: log.reasonCode ?? "" })}
            </p>
          ) : null}
          <p className="mt-1 sam-text-helper text-sam-fg font-mono">{log.sessionId}</p>
          {log.note ? <p className="mt-1 sam-text-helper text-amber-700">{t("admin_cm_common_note", { text: log.note })}</p> : null}
        </div>
        <div className="text-right sam-text-helper text-sam-meta">
          <div>{formatDateTime(log.createdAt)}</div>
          <div className="mt-1">
            <Link
              href={`/admin/chats/messenger/${encodeURIComponent(log.roomId)}`}
              className="text-signature hover:underline"
            >
              {t("admin_cm_action_room_detail")}
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
  const { t } = useCmAdminLabels();
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
        await dibayAlert({ title: json.error ?? t("admin_cm_err_report_action_failed") });
        return;
      }
      await onRefresh();
    } finally {}
  };

  return (
    <div className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="sam-text-body font-medium text-sam-fg">
            {report.reportType} · {report.roomTitle}
          </p>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_cm_common_reporter_line", { reporter: report.reporterLabel, target: report.reportedUserLabel, status: report.status })}
          </p>
          <p className="mt-1 sam-text-helper text-sam-fg">
            {t("admin_cm_common_reason_line", { reason: `${report.reasonType}${report.reasonDetail ? ` · ${report.reasonDetail}` : ""}` })}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy === `report:${report.id}:reviewing`}
            onClick={() => void run("reviewing")}
            className="rounded border border-sam-border px-2.5 py-1.5 sam-text-helper text-sam-fg"
          >
            {t("admin_cm_action_reviewing")}
          </button>
          <button
            type="button"
            disabled={busy === `report:${report.id}:resolved`}
            onClick={() => void run("resolved")}
            className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 sam-text-helper text-emerald-700"
          >
            {t("admin_cm_action_resolve")}
          </button>
          {report.messageId ? (
            <button
              type="button"
              disabled={busy === `report:${report.id}:sanction_message_hide`}
              onClick={() => void run("sanction_message_hide")}
              className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1.5 sam-text-helper text-orange-700"
            >
              {t("admin_cm_action_hide_message")}
            </button>
          ) : null}
          {report.roomId ? (
            <button
              type="button"
              disabled={busy === `report:${report.id}:sanction_room_block`}
              onClick={() => void run("sanction_room_block")}
              className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 sam-text-helper text-red-700"
            >
              {t("admin_cm_action_block_room")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildForceEndReasonStats(callAudits: AdminCommunityMessengerCallAuditLog[], t: CmAdminTranslate) {
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
      label: cmForceEndReasonLabel(t, reason.code),
      count,
      share: total > 0 ? count / total : 0,
    };
  }).filter((item) => item.count > 0 || total === 0);
}

function buildForceEndTrendStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  periodFilter: "24h" | "7d" | "30d" | "",
  t: CmAdminTranslate
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
      label: period === "24h" ? t("admin_cm_period_24h") : period === "7d" ? t("admin_cm_period_7d") : t("admin_cm_period_30d"),
      currentCount,
      previousCount,
      delta,
      direction: delta > 0 ? ("up" as const) : delta < 0 ? ("down" as const) : ("flat" as const),
    };
  });
}

function buildForceEndAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[], t: CmAdminTranslate) {
  const total = callAudits.length;
  const countMap = new Map<string, number>();
  for (const audit of callAudits) {
    const adminLabel = audit.actorLabel || t("admin_cm_admin_unknown");
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
  roomTypeByRoomId: Map<string, "direct" | "private_group" | "open_group">,
  t: CmAdminTranslate
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
    { key: "direct", label: t("admin_cm_room_type_direct"), count: countMap.get("direct") ?? 0 },
    { key: "private_group", label: t("admin_cm_room_type_private_group"), count: countMap.get("private_group") ?? 0 },
    { key: "open_group", label: t("admin_cm_room_type_open_group"), count: countMap.get("open_group") ?? 0 },
    { key: "unknown", label: t("admin_cm_room_type_unknown"), count: countMap.get("unknown") ?? 0 },
  ].map((item) => ({
    ...item,
    share: total > 0 ? item.count / total : 0,
  }));
}

function buildForceEndRecurrenceAnalysis(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  roomTitleByRoomId: Map<string, string>,
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,
  t: CmAdminTranslate
) {
  const roomCounts = new Map<string, { key: string; label: string; totalCount: number; latestAt: string }>();
  const callerCounts = new Map<string, { key: string; label: string; totalCount: number; latestAt: string }>();
  let resolvedCallerAuditCount = 0;

  for (const audit of callAudits) {
    const roomKey = audit.roomId || audit.sessionId;
    const existingRoom = roomCounts.get(roomKey);
    const roomLabel = roomTitleByRoomId.get(audit.roomId) || audit.roomTitle || t("admin_cm_default_room_title");
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
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,
  t: CmAdminTranslate
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
    const recurrence = buildForceEndRecurrenceAnalysis(reasonAudits, roomTitleByRoomId, callLogBySessionId, t);
    return {
      code: reason.code,
      label: cmForceEndReasonLabel(t, reason.code),
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
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,
  t: CmAdminTranslate
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
    const adminLabel = audit.actorLabel || t("admin_cm_admin_unknown");
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
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,
  weekdays: string[],
  t: CmAdminTranslate
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
    topForceEndSlots: getTopHeatmapSlots(totalMatrix, weekdays, t),
    topRecurrenceSlots: getTopHeatmapSlots(recurrenceMatrix, weekdays, t),
  };
}

function buildForceEndReasonHeatmapStats(
  callAudits: AdminCommunityMessengerCallAuditLog[],
  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,
  weekdays: string[],
  t: CmAdminTranslate
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
    const heatmap = buildForceEndHeatmapStats(reasonAudits, callLogBySessionId, weekdays, t);
    const recurrenceCount = heatmap.recurrenceMatrix.reduce((sum, row) => sum + row.reduce((rowSum, count) => rowSum + count, 0), 0);
    return {
      code: reason.code,
      label: cmForceEndReasonLabel(t, reason.code),
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

function buildForceEndReasonAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[], t: CmAdminTranslate) {
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
      const adminLabel = audit.actorLabel || t("admin_cm_admin_unknown");
      adminCounts.set(adminLabel, (adminCounts.get(adminLabel) ?? 0) + 1);
    }
    return {
      code: reason.code,
      label: cmForceEndReasonLabel(t, reason.code),
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

function getTopHeatmapSlots(matrix: number[][], weekdays: string[], t: CmAdminTranslate) {
  return matrix
    .flatMap((row, weekday) =>
      row.map((count, hour) => ({
        label: t("admin_cm_heatmap_slot_label", {
          weekday: weekdays[weekday] ?? "",
          hour: String(hour).padStart(2, "0"),
        }),
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
    return { backgroundColor: "var(--sam-bg-surface-muted)" };
  }
  const alpha = 0.18 + (count / maxCount) * 0.72;
  return {
    backgroundColor: tone === "red" ? `rgba(239, 68, 68, ${alpha})` : `rgba(245, 158, 11, ${alpha})`,
  };
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
