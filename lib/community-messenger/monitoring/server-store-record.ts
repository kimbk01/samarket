import type {
  MessengerBootstrapBreakdown,
  MessengerMonitoringAlert,
  MessengerMonitoringEvent,
} from "./types";
import { logMessengerAlertDev } from "./logger";
import {
  buildFailureRateAlert,
  buildThresholdAlert,
  MESSENGER_PERF_THRESHOLDS,
  shouldAlertFailureRate,
  shouldAlertLatency,
  shouldAlertPacketLoss,
} from "./thresholds";
import {
  estimateMonitoringEventPayloadBytes,
  getMessengerMonitoringStoreRoot,
  MAX_SESSION_IDS,
  trimMessengerMonitoringMapOldest,
  trimMessengerMonitoringSessionSet,
  type Agg,
  type MessengerMonitoringStore as Store,
} from "./server-store-root";
import { samarketMessengerTraceLogEnabled } from "@/lib/debug/samarket-server-trace-flags";

const getStore = getMessengerMonitoringStoreRoot;

/** `cm-rt-hs4-diagnosis` 모듈을 정적으로 끌지 않기 위한 동일 조건(진단 로그만 지연·비동기). */
function cmRtHs4DiagnosisEnabledInline(): boolean {
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return false;
  if (samarketMessengerTraceLogEnabled()) return true;
  if (env.CM_RT_HS4_DIAG === "1") return true;
  if (env.NEXT_PUBLIC_CM_RT_HS4_DIAG === "1") return true;
  return false;
}

function scheduleCmRtHs4DiagnosisLog(event: string, payload: Record<string, unknown>): void {
  if (!cmRtHs4DiagnosisEnabledInline()) return;
  void import("@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis")
    .then((m) => {
      m.cmRtHs4DiagnosisLog(event, payload);
    })
    .catch(() => {});
}

function scheduleCmRtHs4SessionRollupLog(payload: Record<string, unknown>): void {
  void import("@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis")
    .then((m) => {
      if (!m.cmRtHs4DiagnosisEnabled()) return;
      m.cmRtHs4SessionRollupLog(payload);
    })
    .catch(() => {});
}

function trimMapOldest<K, V>(map: Map<K, V>, max: number): void {
  trimMessengerMonitoringMapOldest(map, max);
}

function trimSessionSet(set: Set<string>): void {
  trimMessengerMonitoringSessionSet(set);
}

const MAX_EVENTS_PROD = 400;
const MAX_EVENTS_DEV_ENV = Number(process.env.SAMARKET_MONITORING_MAX_EVENTS_DEV);
/** dev 기본 40 — RSS 압력 시 `SAMARKET_MONITORING_MAX_EVENTS_DEV`(≥32)로 조정 */
const MAX_EVENTS =
  process.env.NODE_ENV === "development"
    ? Number.isFinite(MAX_EVENTS_DEV_ENV) && MAX_EVENTS_DEV_ENV >= 32
      ? Math.floor(MAX_EVENTS_DEV_ENV)
      : 40
    : Number(process.env.SAMARKET_MONITORING_MAX_EVENTS_PROD ?? MAX_EVENTS_PROD) || MAX_EVENTS_PROD;
const MAX_ALERTS = process.env.NODE_ENV === "development" ? 5 : 80;
const MAX_AGG_KEYS = process.env.NODE_ENV === "development" ? 10 : 600;
const MAX_CLIENT_AGG_KEYS = process.env.NODE_ENV === "development" ? 10 : 600;
const MAX_OUTCOME_KEYS = process.env.NODE_ENV === "development" ? 20 : 220;
const MAX_SUBSCRIPTION_LOG_DEV = 20;
const MAX_FAILURE_RATIO_KEYS = 64;
const RATIO_ALERT_COOLDOWN_MS = 90_000;
const AGG_KEY = (e: MessengerMonitoringEvent) => `${e.category}:${e.metric}:${e.source}`;

/** HS4-1: 세션 미해결 initial error 가 창 끝까지 남으면 stale 로만 최종 실패 처리 */
const CHANNEL_SUBSCRIBE_SESSION_STALE_MS = Number(process.env.CM_RT_HS4_SESSION_STALE_MS ?? 120_000);

/** Raw Supabase 채널 상태 콜백 단위 집계 (기존 realtime.subscription 과 동일 분모) */
const OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK = "realtime.subscription:channel_subscribe_callback";
/** 구독 시도 세션(복구 성공 vs 최종 실패) — transient initial + retry 성공 은 recovered 로 최종 실패에서 제외 */
const OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL = "realtime.subscription:channel_subscribe_session_final";

let lastSessionRollupLogAt = 0;

function emptyAgg(): Agg {
  return { count: 0, sum: 0, last: 0, lastAt: 0 };
}

function bumpAgg(map: Map<string, Agg>, key: string, value: number) {
  const cur = map.get(key) ?? emptyAgg();
  cur.count += 1;
  cur.sum += value;
  cur.last = value;
  cur.lastAt = Date.now();
  map.set(key, cur);
}

function bumpOutcome(store: Store, key: string, ok: boolean) {
  const cur = store.outcomes.get(key) ?? { ok: 0, fail: 0 };
  if (ok) cur.ok += 1;
  else cur.fail += 1;
  store.outcomes.set(key, cur);
}

/** scope + 채널명 + bindOrdinal — 동일 물리 채널 재바인드 상관 */
function buildChannelSubscribeSessionKey(labels: Record<string, string>): string {
  const scope = (labels.scope ?? "").trim();
  const cn = (labels.hs4_channelName ?? "").trim();
  const ord = (labels.hs4_bindOrdinal ?? "").trim();
  return `${scope}\u001f${cn}\u001f${ord}`;
}

/** 세션 최종 실패 집계에서 제외(클라 라벨 확장 전까지는 대부분 0) */
function shouldExcludeFromSubscribeSessionFinal(labels: Record<string, string>): boolean {
  if (labels.hs4_excludeSessionFinal === "1") return true;
  if (labels.hs4_explicitStop === "1") return true;
  if (labels.hs4_expectedInternalClosed === "1") return true;
  return false;
}

function computeSubscribeSessionRollupFromEvents(
  events: MessengerMonitoringEvent[],
  nowMs: number
): {
  callbackOk: number;
  callbackFail: number;
  sessionFinalOk: number;
  sessionFinalFail: number;
  recoveredSessionCount: number;
  unrecoveredFailureCount: number;
  cleanInitialOkSessions: number;
  stalePendingFinalFailures: number;
  retryStepFailures: number;
  explicitStopExcluded: number;
  expectedClosedExcluded: number;
  pendingUnresolvedSessionKeys: number;
  rawCallbackFailureRatio: number;
  sessionFinalFailureRatio: number;
} {
  const subscribeEvents = events
    .filter(
      (e) =>
        e.unit === "count" &&
        e.category === "realtime.subscription" &&
        e.metric === "channel_subscribe" &&
        e.labels?.outcome
    )
    .sort((a, b) => a.ts - b.ts);

  let callbackOk = 0;
  let callbackFail = 0;

  const pending = new Map<string, number>();
  let recoveredSessionCount = 0;
  let cleanInitialOkSessions = 0;
  let retryStepFailures = 0;
  let stalePendingFinalFailures = 0;
  let explicitStopExcluded = 0;
  let expectedClosedExcluded = 0;

  const maxTs =
    subscribeEvents.length > 0 ? Math.max(...subscribeEvents.map((e) => e.ts)) : nowMs;

  for (const e of subscribeEvents) {
    const labels = e.labels ?? {};
    const outcomeOk = labels.outcome === "ok";
    if (outcomeOk) callbackOk++;
    else callbackFail++;

    if (shouldExcludeFromSubscribeSessionFinal(labels)) {
      if (labels.hs4_explicitStop === "1") explicitStopExcluded++;
      if (labels.hs4_expectedInternalClosed === "1") expectedClosedExcluded++;
      continue;
    }

    const phase = (labels.attemptPhase ?? "").trim();
    const status = (labels.status ?? "").trim();
    const key = buildChannelSubscribeSessionKey(labels);

    if (phase === "initial") {
      if (!outcomeOk) {
        pending.set(key, e.ts);
      } else {
        pending.delete(key);
        cleanInitialOkSessions++;
      }
    } else if (phase === "retry") {
      if (outcomeOk && status === "SUBSCRIBED") {
        if (pending.has(key)) {
          recoveredSessionCount++;
          pending.delete(key);
        }
      } else if (!outcomeOk) {
        retryStepFailures++;
        pending.delete(key);
      }
    }
  }

  for (const [key, ts] of [...pending.entries()]) {
    if (maxTs - ts > CHANNEL_SUBSCRIBE_SESSION_STALE_MS) {
      stalePendingFinalFailures++;
      pending.delete(key);
    }
  }

  const unrecoveredFailureCount = retryStepFailures + stalePendingFinalFailures;
  const sessionFinalOk = cleanInitialOkSessions + recoveredSessionCount;
  const sessionFinalFail = unrecoveredFailureCount;

  const cbDenom = callbackOk + callbackFail;
  const sfDenom = sessionFinalOk + sessionFinalFail;

  return {
    callbackOk,
    callbackFail,
    sessionFinalOk,
    sessionFinalFail,
    recoveredSessionCount,
    unrecoveredFailureCount,
    cleanInitialOkSessions,
    stalePendingFinalFailures,
    retryStepFailures,
    explicitStopExcluded,
    expectedClosedExcluded,
    pendingUnresolvedSessionKeys: pending.size,
    rawCallbackFailureRatio: cbDenom ? callbackFail / cbDenom : 0,
    sessionFinalFailureRatio: sfDenom ? sessionFinalFail / sfDenom : 0,
  };
}

function isChannelSubscribeOutcomeEvent(event: MessengerMonitoringEvent): boolean {
  return (
    event.unit === "count" &&
    event.category === "realtime.subscription" &&
    event.metric === "channel_subscribe" &&
    Boolean(event.labels?.outcome)
  );
}

function isSignalPostOutcomeEvent(event: MessengerMonitoringEvent): boolean {
  return (
    event.unit === "count" &&
    event.category === "call.signaling" &&
    event.metric === "signal_post" &&
    Boolean(event.labels?.outcome)
  );
}

/** 구독 outcome·세션 롤업 키만 제거 — `call.signaling` 누적은 유지 */
function removeSubscribeDerivedOutcomeKeys(store: Store) {
  for (const key of [...store.outcomes.keys()]) {
    if (key === "call.signaling") continue;
    if (
      key.startsWith("realtime.subscription") ||
      key === OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK ||
      key === OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL
    ) {
      store.outcomes.delete(key);
    }
  }
}

function replaySubscribeOutcomeRows(store: Store, log: MessengerMonitoringEvent[]) {
  for (const event of log) {
    if (!isChannelSubscribeOutcomeEvent(event)) continue;
    const ok = event.labels!.outcome === "ok";
    bumpOutcome(store, "realtime.subscription", ok);
    const scope = typeof event.labels!.scope === "string" ? event.labels!.scope.trim() : "";
    if (scope) {
      bumpOutcome(store, `realtime.subscription:${scope}`, ok);
    }
    const attemptPhase =
      typeof event.labels!.attemptPhase === "string" ? event.labels!.attemptPhase.trim() : "";
    if (attemptPhase) {
      bumpOutcome(store, `realtime.subscription:phase:${attemptPhase}`, ok);
      if (scope) {
        bumpOutcome(store, `realtime.subscription:${scope}:phase:${attemptPhase}`, ok);
      }
    }
  }
}

function applySubscribeRollupToStore(store: Store, log: MessengerMonitoringEvent[]) {
  const rollup = computeSubscribeSessionRollupFromEvents(log, Date.now());
  store.outcomes.set(OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK, {
    ok: rollup.callbackOk,
    fail: rollup.callbackFail,
  });
  store.outcomes.set(OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL, {
    ok: rollup.sessionFinalOk,
    fail: rollup.sessionFinalFail,
  });

  if (process.env.NODE_ENV === "development") {
    trimMapOldest(store.outcomes, MAX_OUTCOME_KEYS);
  }

  if (rollup.callbackOk + rollup.callbackFail > 0 && cmRtHs4DiagnosisEnabledInline()) {
    const now = Date.now();
    if (now - lastSessionRollupLogAt >= 12_000) {
      lastSessionRollupLogAt = now;
      scheduleCmRtHs4SessionRollupLog({
        rawCallbackFailureRatio: rollup.rawCallbackFailureRatio,
        sessionFinalFailureRatio: rollup.sessionFinalFailureRatio,
        recoveredInitialFailureCount: rollup.recoveredSessionCount,
        recoveredSessionCount: rollup.recoveredSessionCount,
        unrecoveredFailureCount: rollup.unrecoveredFailureCount,
        retryStepFailures: rollup.retryStepFailures,
        stalePendingFinalFailures: rollup.stalePendingFinalFailures,
        explicitStopCount: rollup.explicitStopExcluded,
        expectedClosedCount: rollup.expectedClosedExcluded,
        pendingUnresolvedSessionKeys: rollup.pendingUnresolvedSessionKeys,
        sessionCountResolved: rollup.sessionFinalOk + rollup.sessionFinalFail,
        callbackOk: rollup.callbackOk,
        callbackFail: rollup.callbackFail,
        sessionFinalOk: rollup.sessionFinalOk,
        sessionFinalFail: rollup.sessionFinalFail,
      });
    }
  }
}

function refreshSubscribeOutcomesFromLog(store: Store) {
  const d = store.storeDiagnostics;
  d.lastOutcomeRefreshWasSubscribe = true;
  d.lastOutcomeRefreshWasSignaling = false;
  removeSubscribeDerivedOutcomeKeys(store);
  replaySubscribeOutcomeRows(store, store.subscriptionEventLog);
  applySubscribeRollupToStore(store, store.subscriptionEventLog);
}

function appendSubscriptionEventLog(store: Store, event: MessengerMonitoringEvent) {
  const snap: MessengerMonitoringEvent = {
    ts: event.ts,
    category: event.category,
    metric: event.metric,
    source: event.source,
    value: event.value,
    unit: event.unit,
    labels: event.labels ? { ...event.labels } : undefined,
    kind: event.kind,
  };
  store.subscriptionEventLog.push(snap);
  const maxSub =
    process.env.NODE_ENV === "development"
      ? MAX_SUBSCRIPTION_LOG_DEV
      : Math.max(48, Math.min(MAX_EVENTS + 80, 400));
  if (store.subscriptionEventLog.length > maxSub) {
    const rm = store.subscriptionEventLog.length - maxSub;
    store.subscriptionEventLog.splice(0, rm);
    store.storeDiagnostics.subscriptionLogTrimmedTotal += rm;
    store.storeDiagnostics.lastSubscriptionLogPruneRemoved = rm;
    store.storeDiagnostics.lastPruneTriggered = true;
  }
}

function bumpSignalingOutcomeIncremental(store: Store, event: MessengerMonitoringEvent) {
  const d = store.storeDiagnostics;
  d.lastOutcomeRefreshWasSignaling = true;
  d.lastOutcomeRefreshWasSubscribe = false;
  bumpOutcome(store, "call.signaling", event.labels!.outcome === "ok");
}

function maybeFailureRatioAlert(
  store: Store,
  kind:
    | "subscriptionFailureRate"
    | "subscriptionSessionFinalFailureRate"
    | "signalingFailureRate",
  outcomeKey: string,
  category: MessengerMonitoringEvent["category"],
  metric: string
) {
  const bucket = store.outcomes.get(outcomeKey);
  if (!bucket) return;
  const attempts = bucket.ok + bucket.fail;
  const rate = attempts ? bucket.fail / attempts : 0;
  if (!shouldAlertFailureRate(kind, rate, attempts)) return;
  const last = store.lastFailureRatioAlertTs.get(kind) ?? 0;
  if (Date.now() - last < RATIO_ALERT_COOLDOWN_MS) return;
  store.lastFailureRatioAlertTs.set(kind, Date.now());
  const thr =
    kind === "signalingFailureRate"
      ? MESSENGER_PERF_THRESHOLDS.signalingFailRateCritical
      : MESSENGER_PERF_THRESHOLDS.subscriptionFailRateCritical;
  pushAlert(
    store,
    buildFailureRateAlert(category, metric, rate, thr, { outcomeKey })
  );
}

function maybeReconnectSessionRateAlert(store: Store) {
  const opened = store.callSessionsOpened.size;
  const withRe = store.callSessionsWithReconnect.size;
  if (opened < 8) return;
  const rate = withRe / opened;
  if (!shouldAlertFailureRate("reconnectSessionRate", rate, opened)) return;
  const last = store.lastFailureRatioAlertTs.get("reconnectSessionRate") ?? 0;
  if (Date.now() - last < RATIO_ALERT_COOLDOWN_MS) return;
  store.lastFailureRatioAlertTs.set("reconnectSessionRate", Date.now());
  pushAlert(
    store,
    buildFailureRateAlert(
      "call.reconnect",
      "reconnect_session_rate",
      rate,
      MESSENGER_PERF_THRESHOLDS.reconnectSessionRateCritical,
      { sessionsOpened: String(opened), sessionsWithReconnect: String(withRe) }
    )
  );
}

function backfillSubscriptionEventLogFromEventsIfNeeded(store: Store) {
  if (store.subscriptionEventLog.length > 0) return;
  if (store.events.length === 0) return;
  const marker = store as Store & { __cmSubLogBackfilled?: boolean };
  if (marker.__cmSubLogBackfilled) return;
  marker.__cmSubLogBackfilled = true;
  for (const ev of store.events) {
    if (!isChannelSubscribeOutcomeEvent(ev)) continue;
    const snap: MessengerMonitoringEvent = {
      ts: ev.ts,
      category: ev.category,
      metric: ev.metric,
      source: ev.source,
      value: ev.value,
      unit: ev.unit,
      labels: ev.labels ? { ...ev.labels } : undefined,
      kind: ev.kind,
    };
    store.subscriptionEventLog.push(snap);
  }
  const maxSub =
    process.env.NODE_ENV === "development"
      ? MAX_SUBSCRIPTION_LOG_DEV
      : Math.max(48, Math.min(MAX_EVENTS + 80, 400));
  while (store.subscriptionEventLog.length > maxSub) {
    store.subscriptionEventLog.shift();
    store.storeDiagnostics.subscriptionLogTrimmedTotal += 1;
  }
  refreshSubscribeOutcomesFromLog(store);
}

function updateDiagnosticsForIngestedEvent(store: Store, event: MessengerMonitoringEvent) {
  const d = store.storeDiagnostics;
  const bytes = estimateMonitoringEventPayloadBytes(event);
  d.lastEventPayloadBytes = bytes;
  d.lastEventsPayloadAvgBytes = d.lastEventsPayloadAvgBytes * 0.92 + bytes * 0.08;
  d.lastOldestEventAgeMs = store.events.length ? Date.now() - store.events[0]!.ts : 0;
}

export function recordMessengerMonitoringEvent(event: MessengerMonitoringEvent): void {
  const store = getStore();
  store.storeDiagnostics.lastPruneTriggered = false;
  backfillSubscriptionEventLogFromEventsIfNeeded(store);

  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    const removed = store.events.length - MAX_EVENTS;
    store.events.splice(0, removed);
    store.storeDiagnostics.eventsTrimmedTotal += removed;
    store.storeDiagnostics.lastEventsPruneRemoved = removed;
    store.storeDiagnostics.lastPruneTriggered = true;
  }
  updateDiagnosticsForIngestedEvent(store, event);

  if (isChannelSubscribeOutcomeEvent(event)) {
    appendSubscriptionEventLog(store, event);
    refreshSubscribeOutcomesFromLog(store);
  } else if (isSignalPostOutcomeEvent(event)) {
    bumpSignalingOutcomeIncremental(store, event);
  }

  if (
    event.unit === "count" &&
    event.category === "realtime.subscription" &&
    event.metric === "channel_subscribe"
  ) {
    scheduleCmRtHs4DiagnosisLog("monitoring_store_channel_subscribe_ingest", {
      source: event.source ?? "unknown",
      outcome: event.labels?.outcome ?? "",
      attemptPhase: event.labels?.attemptPhase ?? "",
      scope: event.labels?.scope ?? "",
      status: event.labels?.status ?? "",
      labels: event.labels ?? {},
    });
  }

  const key = AGG_KEY(event);
  if (typeof event.value === "number" && (event.unit === "ms" || event.unit === undefined)) {
    bumpAgg(store.aggregates, key, event.value);
    trimMapOldest(store.aggregates, MAX_AGG_KEYS);
  }
  if (event.source === "client" && typeof event.value === "number") {
    bumpAgg(store.clientAggregates, key, event.value);
    trimMapOldest(store.clientAggregates, MAX_CLIENT_AGG_KEYS);
  }

  if (event.category === "call.connection" && event.metric === "first_connected" && event.labels?.sessionIdSuffix) {
    store.callSessionsOpened.add(event.labels.sessionIdSuffix);
    trimSessionSet(store.callSessionsOpened);
    maybeReconnectSessionRateAlert(store);
  }
  if (
    event.category === "call.reconnect" &&
    event.metric === "peer_transport_recovered" &&
    typeof event.value === "number" &&
    event.value >= 1 &&
    event.labels?.sessionIdSuffix
  ) {
    store.callSessionsWithReconnect.add(event.labels.sessionIdSuffix);
    trimSessionSet(store.callSessionsWithReconnect);
    maybeReconnectSessionRateAlert(store);
  }

  if (
    event.unit === "count" &&
    event.category === "realtime.subscription" &&
    event.metric === "channel_subscribe" &&
    event.labels?.outcome
  ) {
    const phase =
      typeof event.labels.attemptPhase === "string" ? event.labels.attemptPhase.trim() : "";
    if (phase !== "retry") {
      const phaseOutcomeKey = phase ? `realtime.subscription:phase:${phase}` : "realtime.subscription";
      maybeFailureRatioAlert(
        store,
        "subscriptionFailureRate",
        phaseOutcomeKey,
        "realtime.subscription",
        "channel_subscribe_callback_failure_ratio"
      );
    }
    maybeFailureRatioAlert(
      store,
      "subscriptionSessionFinalFailureRate",
      OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL,
      "realtime.subscription",
      "channel_subscribe_session_final_failure_ratio"
    );
  }
  if (event.unit === "count" && event.category === "call.signaling" && event.metric === "signal_post" && event.labels?.outcome) {
    maybeFailureRatioAlert(store, "signalingFailureRate", "call.signaling", "call.signaling", "signal_post");
  }
  if (process.env.NODE_ENV === "development") {
    trimMapOldest(store.lastFailureRatioAlertTs, MAX_FAILURE_RATIO_KEYS);
  }

  if (event.unit === "ms" && typeof event.value === "number") {
    const breach = shouldAlertLatency(event.category, event.metric, event.value, event.labels);
    if (breach) {
      const alert = buildThresholdAlert(breach, event.category, event.metric, event.value, event.labels);
      pushAlert(store, alert);
    }
  }
  if (event.unit === "percent" && typeof event.value === "number" && event.category === "call.network") {
    if (shouldAlertPacketLoss(event.value)) {
      const alert: MessengerMonitoringAlert = {
        ts: Date.now(),
        category: "call.network",
        metric: event.metric,
        threshold: Number(process.env.MESSENGER_PERF_PACKET_LOSS_PCT ?? 8),
        observed: event.value,
        message: `[messenger-perf] 패킷 손실률 높음: ${event.value.toFixed(2)}%`,
        labels: event.labels,
      };
      pushAlert(store, alert);
    }
  }
}

function pushAlert(store: Store, alert: MessengerMonitoringAlert) {
  logMessengerAlertDev(alert);
  store.alerts.push(alert);
  if (store.alerts.length > MAX_ALERTS) {
    const removed = store.alerts.length - MAX_ALERTS;
    store.alerts.splice(0, removed);
    store.storeDiagnostics.alertsTrimmedTotal += removed;
    store.storeDiagnostics.lastAlertsPruneRemoved = removed;
    store.storeDiagnostics.lastPruneTriggered = true;
  }
}

export function recordMessengerBootstrapBreakdown(breakdown: MessengerBootstrapBreakdown): void {
  const store = getStore();
  store.latestBootstrapBreakdown = breakdown;
}

export function ingestClientMessengerEvents(events: MessengerMonitoringEvent[]): void {
  for (const e of events) {
    recordMessengerMonitoringEvent({ ...e, source: "client" });
  }
}
