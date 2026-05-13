/**
 * 메신저 모니터링 in-process store 의 **단일 싱글톤** + 맵 트림 유틸.
 * `server-store-record.ts` / `server-store-summary.ts` / `messenger-api-route-timing.ts` 가 동일 전역을 공유한다(의미·정합 불변).
 * 이 파일은 **가벼운 의존성만** 두어 라우트 번들에서 `server-store` 본문과 분리하기 위함이다.
 */
import type {
  MessengerBootstrapBreakdown,
  MessengerMonitoringAlert,
  MessengerMonitoringEvent,
} from "./types";

export const MAX_SESSION_IDS = 600;
export const MAX_API_ROUTES = 240;

export type Agg = { count: number; sum: number; last: number; lastAt: number };

export type OutcomeBucket = { ok: number; fail: number };

/** in-process only — API 응답 shape 밖(dev 메모리·운영 로그용) */
export type MessengerMonitoringStoreDiagnostics = {
  eventsTrimmedTotal: number;
  subscriptionLogTrimmedTotal: number;
  alertsTrimmedTotal: number;
  duplicateEventSuppressCount: number;
  lastEventsPruneRemoved: number;
  lastSubscriptionLogPruneRemoved: number;
  lastAlertsPruneRemoved: number;
  lastPruneTriggered: boolean;
  lastEventPayloadBytes: number;
  lastEventsPayloadAvgBytes: number;
  lastOldestEventAgeMs: number;
  lastOutcomeRefreshWasSubscribe: boolean;
  lastOutcomeRefreshWasSignaling: boolean;
};

export function createMessengerMonitoringStoreDiagnostics(): MessengerMonitoringStoreDiagnostics {
  return {
    eventsTrimmedTotal: 0,
    subscriptionLogTrimmedTotal: 0,
    alertsTrimmedTotal: 0,
    duplicateEventSuppressCount: 0,
    lastEventsPruneRemoved: 0,
    lastSubscriptionLogPruneRemoved: 0,
    lastAlertsPruneRemoved: 0,
    lastPruneTriggered: false,
    lastEventPayloadBytes: 0,
    lastEventsPayloadAvgBytes: 0,
    lastOldestEventAgeMs: 0,
    lastOutcomeRefreshWasSubscribe: false,
    lastOutcomeRefreshWasSignaling: false,
  };
}

export type MessengerMonitoringStore = {
  events: MessengerMonitoringEvent[];
  /** channel_subscribe + outcome 만 — 롤업·outcome 재계산 시 `events` 전체 스캔 생략 */
  subscriptionEventLog: MessengerMonitoringEvent[];
  storeDiagnostics: MessengerMonitoringStoreDiagnostics;
  aggregates: Map<string, Agg>;
  apiByRoute: Map<string, { count: number; sum: number; last: number }>;
  clientAggregates: Map<string, Agg>;
  latestBootstrapBreakdown: MessengerBootstrapBreakdown | null;
  alerts: MessengerMonitoringAlert[];
  outcomes: Map<string, OutcomeBucket>;
  callSessionsOpened: Set<string>;
  callSessionsWithReconnect: Set<string>;
  lastFailureRatioAlertTs: Map<string, number>;
};

export function getMessengerMonitoringStoreRoot(): MessengerMonitoringStore {
  const g = globalThis as unknown as { __messengerMonitoringStore?: MessengerMonitoringStore };
  if (!g.__messengerMonitoringStore) {
    g.__messengerMonitoringStore = {
      events: [],
      subscriptionEventLog: [],
      storeDiagnostics: createMessengerMonitoringStoreDiagnostics(),
      aggregates: new Map(),
      apiByRoute: new Map(),
      clientAggregates: new Map(),
      latestBootstrapBreakdown: null,
      alerts: [],
      outcomes: new Map(),
      callSessionsOpened: new Set(),
      callSessionsWithReconnect: new Set(),
      lastFailureRatioAlertTs: new Map(),
    };
  } else {
    const s = g.__messengerMonitoringStore;
    s.subscriptionEventLog ??= [];
    s.storeDiagnostics ??= createMessengerMonitoringStoreDiagnostics();
    s.outcomes ??= new Map();
    s.callSessionsOpened ??= new Set();
    s.callSessionsWithReconnect ??= new Set();
    s.lastFailureRatioAlertTs ??= new Map();
    s.latestBootstrapBreakdown ??= null;
  }
  return g.__messengerMonitoringStore;
}

export function trimMessengerMonitoringSessionSet(set: Set<string>): void {
  if (set.size <= MAX_SESSION_IDS) return;
  const arr = [...set];
  set.clear();
  for (const id of arr.slice(-MAX_SESSION_IDS)) set.add(id);
}

export function trimMessengerMonitoringMapOldest<K, V>(map: Map<K, V>, max: number): void {
  if (map.size <= max) return;
  const overflow = map.size - max;
  if (overflow <= 0) return;
  const it = map.keys();
  for (let i = 0; i < overflow; i++) {
    const n = it.next();
    if (n.done) break;
    map.delete(n.value);
  }
}

export type MessengerMonitoringStoreFootprint = {
  eventsLen: number;
  subscriptionEventLogLen: number;
  alertsLen: number;
  aggregatesSize: number;
  apiByRouteSize: number;
  clientAggregatesSize: number;
  outcomesSize: number;
  callSessionsOpened: number;
  callSessionsWithReconnect: number;
  lastFailureRatioAlertTsSize: number;
  monitoring_store_events_len: number;
  monitoring_store_alerts_len: number;
  monitoring_store_subscription_log_len: number;
  monitoring_store_trimmed_count: number;
  monitoring_store_duplicate_event_count: number;
  monitoring_store_memory_estimate_mb: number;
  monitoring_store_oldest_event_age_ms: number;
  monitoring_store_prune_triggered: boolean;
  monitoring_store_event_payload_avg_bytes: number;
  monitoring_store_last_event_payload_bytes: number;
};

export function estimateMonitoringEventPayloadBytes(e: MessengerMonitoringEvent): number {
  let n = 56 + e.category.length + e.metric.length + e.source.length;
  if (e.kind) n += 8 + e.kind.length;
  if (typeof e.value === "number") n += 12;
  if (e.unit) n += 4 + e.unit.length;
  if (e.labels) {
    for (const [k, v] of Object.entries(e.labels)) {
      n += k.length + v.length;
    }
  }
  return n;
}

export function getMessengerMonitoringStoreFootprint(): MessengerMonitoringStoreFootprint {
  const s = getMessengerMonitoringStoreRoot();
  const d = s.storeDiagnostics ?? createMessengerMonitoringStoreDiagnostics();
  const now = Date.now();
  const oldestTs = s.events.length ? s.events[0]!.ts : now;
  const memEstBytes =
    d.lastEventsPayloadAvgBytes * s.events.length +
    d.lastEventsPayloadAvgBytes * 0.85 * s.subscriptionEventLog.length +
    (s.aggregates.size + s.clientAggregates.size + s.apiByRoute.size) * 120;
  return {
    eventsLen: s.events.length,
    subscriptionEventLogLen: s.subscriptionEventLog.length,
    alertsLen: s.alerts.length,
    aggregatesSize: s.aggregates.size,
    apiByRouteSize: s.apiByRoute.size,
    clientAggregatesSize: s.clientAggregates.size,
    outcomesSize: s.outcomes.size,
    callSessionsOpened: s.callSessionsOpened.size,
    callSessionsWithReconnect: s.callSessionsWithReconnect.size,
    lastFailureRatioAlertTsSize: s.lastFailureRatioAlertTs.size,
    monitoring_store_events_len: s.events.length,
    monitoring_store_alerts_len: s.alerts.length,
    monitoring_store_subscription_log_len: s.subscriptionEventLog.length,
    monitoring_store_trimmed_count: d.eventsTrimmedTotal + d.subscriptionLogTrimmedTotal + d.alertsTrimmedTotal,
    monitoring_store_duplicate_event_count: d.duplicateEventSuppressCount,
    monitoring_store_memory_estimate_mb: Math.round((memEstBytes / (1024 * 1024)) * 1000) / 1000,
    monitoring_store_oldest_event_age_ms: Math.max(0, now - oldestTs),
    monitoring_store_prune_triggered: d.lastPruneTriggered,
    monitoring_store_event_payload_avg_bytes: Math.round(d.lastEventsPayloadAvgBytes),
    monitoring_store_last_event_payload_bytes: d.lastEventPayloadBytes,
  };
}
