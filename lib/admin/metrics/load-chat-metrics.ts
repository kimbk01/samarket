/**
 * 채팅 지표 값 로더 (서버 전용) — `chat-metrics.ts` 정의를 실제 값으로 채운다.
 * 관리자 읽기 전용 head COUNT 만 수행한다 (고객 hot-path 쿼리 없음). 실패 = null (「확인 불가」).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import { CHAT_DOMAINS } from "@/lib/chat-domain/chat-domain";
import {
  CHAT_CALL_FAILED_REASON_PREFIX,
  CHAT_CALL_STATUSES_7D,
  CHAT_METRIC_DEFINITIONS,
  CHAT_PUSH_EVENT_GROUP_KEYS,
  CHAT_PUSH_EVENT_GROUPS,
  CHAT_REPORT_OPEN_STATUSES,
  CHAT_ROOM_STATE_KEYS,
  chatActiveWindowFromIso,
  chatIdleCutoffIso,
  chatRiskWindowFromIso,
  chatStuckRingingBeforeIso,
  resolveChatDirectMetric,
  resolveChatQueueMetric,
  type ChatMetricId,
  type ChatMetricValue,
  type ChatPushEventGroup,
  type ChatRoomStateKey,
} from "@/lib/admin/metrics/chat-metrics";

export type ChatMetricsSnapshot = {
  values: ReadonlyMap<ChatMetricId, ChatMetricValue>;
  sectionErrors: string[];
};

export async function loadChatMetrics(sb: SupabaseClient, now: Date = new Date()): Promise<ChatMetricsSnapshot> {
  const sectionErrors: string[] = [];
  const sbAny = sb as any;
  const activeFrom = chatActiveWindowFromIso(now);
  const idleCutoff = chatIdleCutoffIso(now);
  const riskFrom = chatRiskWindowFromIso(now);
  const stuckBefore = chatStuckRingingBeforeIso(now);

  const head = (table: string) => sbAny.from(table).select("id", { count: "exact", head: true });
  const count = (table: string, f: (q: any) => any) => adminDomainCountExact(() => f(head(table)));
  const rooms = (f: (q: any) => any) => count("community_messenger_rooms", (q) => f(q.is("deleted_at", null)));
  const calls = (f: (q: any) => any) => count("community_messenger_call_sessions", f);

  const pushFailed = (group: ChatPushEventGroup) =>
    count("notification_deliveries", (q) => {
      const g = CHAT_PUSH_EVENT_GROUPS[group];
      const base = q.eq("status", "failed").gte("created_at", riskFrom);
      return g.prefix ? base.like("event_type", `${g.prefix}%`) : base.in("event_type", [...g.eventTypes]);
    });

  const roomState = (domain: string, state: ChatRoomStateKey) =>
    rooms((q) => {
      const byDomain = q.eq("chat_domain", domain);
      return state === "active_7d"
        ? byDomain.eq("room_status", "active").gte("last_message_at", activeFrom)
        : byDomain.eq("room_status", state);
    });

  const roomStateKeys = CHAT_DOMAINS.flatMap((d) => CHAT_ROOM_STATE_KEYS.map((s) => [d, s] as const));

  const [queueRes, tradeChatReports, tradeRoomReports, push, callFailed, callStuck, roomStates, calls7d, idle] =
    await Promise.all([
      loadAdminActionQueueCounts({ storesSb: sbAny, notesSb: sbAny }).catch((e: unknown) => {
        sectionErrors.push(`action_queue:${e instanceof Error ? e.message : "error"}`);
        return null;
      }),
      count("chat_reports", (q) => q.in("status", [...CHAT_REPORT_OPEN_STATUSES.trade_chat])),
      count("reports", (q) =>
        q.eq("target_type", "chat_room").in("status", [...CHAT_REPORT_OPEN_STATUSES.trade_report])
      ),
      Promise.all(CHAT_PUSH_EVENT_GROUP_KEYS.map(pushFailed)),
      calls((q) => q.like("ended_reason", `${CHAT_CALL_FAILED_REASON_PREFIX}%`).gte("created_at", riskFrom)),
      calls((q) => q.eq("status", "ringing").lt("created_at", stuckBefore)),
      Promise.all(roomStateKeys.map(([d, s]) => roomState(d, s))),
      Promise.all(CHAT_CALL_STATUSES_7D.map((s) => calls((q) => q.eq("status", s).gte("created_at", activeFrom)))),
      Promise.all(CHAT_DOMAINS.map((d) => rooms((q) => q.eq("chat_domain", d).lt("last_message_at", idleCutoff)))),
    ]);

  const direct: Partial<Record<ChatMetricId, number | null>> = {
    "chat.reports_open.trade_chat": tradeChatReports,
    "chat.reports_open.trade_report": tradeRoomReports,
    "chat.call_failed_24h": callFailed,
    "chat.call_stuck_ringing": callStuck,
  };
  CHAT_PUSH_EVENT_GROUP_KEYS.forEach((g, i) => {
    direct[`chat.push_failed_24h.${g}`] = push[i];
  });
  roomStateKeys.forEach(([d, s], i) => {
    direct[`chat.rooms.${d}.${s}`] = roomStates[i];
  });
  CHAT_CALL_STATUSES_7D.forEach((s, i) => {
    direct[`chat.calls_7d.${s}`] = calls7d[i];
  });
  CHAT_DOMAINS.forEach((d, i) => {
    direct[`chat.rooms_idle_90d.${d}`] = idle[i];
  });

  const values = new Map<ChatMetricId, ChatMetricValue>();
  for (const def of CHAT_METRIC_DEFINITIONS) {
    const v =
      def.source.kind === "queue"
        ? resolveChatQueueMetric(def, queueRes?.categories ?? null)
        : resolveChatDirectMetric(def, direct[def.id]);
    if (v.value == null && !v.forbidden) sectionErrors.push(`${def.id}:unavailable`);
    values.set(def.id, v);
  }
  return { values, sectionErrors };
}
