import { MESSENGER_MONITORING_LABEL_DOMAIN } from "@/lib/chat-domain/messenger-domains";
import type {
  MessengerMonitoringAlert,
  MessengerMonitoringEvent,
  MessengerMonitoringSummary,
  MessengerOutcomeStat,
  MessengerSloDigestRow,
} from "./types";
import { logMessengerAlertDev } from "./logger";
import {
  buildFailureRateAlert,
  buildThresholdAlert,
  MESSENGER_PERF_REFERENCE_P95_MS,
  MESSENGER_PERF_REFERENCE_RATIOS,
  MESSENGER_PERF_THRESHOLDS,
  shouldAlertFailureRate,
  shouldAlertLatency,
  shouldAlertPacketLoss,
} from "./thresholds";

const MAX_EVENTS = 400;
const MAX_ALERTS = 80;
const MAX_SESSION_IDS = 600;
const RATIO_ALERT_COOLDOWN_MS = 90_000;
const AGG_KEY = (e: MessengerMonitoringEvent) => `${e.category}:${e.metric}:${e.source}`;

type Agg = { count: number; sum: number; last: number; lastAt: number };

function emptyAgg(): Agg {
  return { count: 0, sum: 0, last: 0, lastAt: 0 };
}

type OutcomeBucket = { ok: number; fail: number };

type Store = {
  events: MessengerMonitoringEvent[];
  aggregates: Map<string, Agg>;
  apiByRoute: Map<string, { count: number; sum: number; last: number }>;
  clientAggregates: Map<string, Agg>;
  alerts: MessengerMonitoringAlert[];
  outcomes: Map<string, OutcomeBucket>;
  /** 통화 세션 suffix — `first_connected` 기준 */
  callSessionsOpened: Set<string>;
  /** 한 번이라도 `peer_transport_recovered` (count≥1) 기록된 세션 */
  callSessionsWithReconnect: Set<string>;
  lastFailureRatioAlertTs: Map<string, number>;
};

function getStore(): Store {
  const g = globalThis as unknown as { __messengerMonitoringStore?: Store };
  if (!g.__messengerMonitoringStore) {
    g.__messengerMonitoringStore = {
      events: [],
      aggregates: new Map(),
      apiByRoute: new Map(),
      clientAggregates: new Map(),
      alerts: [],
      outcomes: new Map(),
      callSessionsOpened: new Set(),
      callSessionsWithReconnect: new Set(),
      lastFailureRatioAlertTs: new Map(),
    };
  } else {
    const s = g.__messengerMonitoringStore;
    s.outcomes ??= new Map();
    s.callSessionsOpened ??= new Set();
    s.callSessionsWithReconnect ??= new Set();
    s.lastFailureRatioAlertTs ??= new Map();
  }
  return g.__messengerMonitoringStore;
}

function trimSessionSet(set: Set<string>) {
  if (set.size <= MAX_SESSION_IDS) return;
  const arr = [...set];
  set.clear();
  for (const id of arr.slice(-MAX_SESSION_IDS)) set.add(id);
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

function recomputeOutcomesFromEventWindow(store: Store) {
  store.outcomes.clear();
  for (const event of store.events) {
    if (
      event.unit === "count" &&
      event.category === "realtime.subscription" &&
      event.metric === "channel_subscribe" &&
      event.labels?.outcome
    ) {
      const ok = event.labels.outcome === "ok";
      bumpOutcome(store, "realtime.subscription", ok);
      const scope = typeof event.labels.scope === "string" ? event.labels.scope.trim() : "";
      if (scope) {
        bumpOutcome(store, `realtime.subscription:${scope}`, ok);
      }
      const attemptPhase =
        typeof event.labels.attemptPhase === "string" ? event.labels.attemptPhase.trim() : "";
      if (attemptPhase) {
        bumpOutcome(store, `realtime.subscription:phase:${attemptPhase}`, ok);
        if (scope) {
          bumpOutcome(store, `realtime.subscription:${scope}:phase:${attemptPhase}`, ok);
        }
      }
      continue;
    }
    if (
      event.unit === "count" &&
      event.category === "call.signaling" &&
      event.metric === "signal_post" &&
      event.labels?.outcome
    ) {
      bumpOutcome(store, "call.signaling", event.labels.outcome === "ok");
    }
  }
}

function maybeFailureRatioAlert(
  store: Store,
  kind: "subscriptionFailureRate" | "signalingFailureRate",
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
    kind === "subscriptionFailureRate"
      ? MESSENGER_PERF_THRESHOLDS.subscriptionFailRateCritical
      : MESSENGER_PERF_THRESHOLDS.signalingFailRateCritical;
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

export function recordMessengerMonitoringEvent(event: MessengerMonitoringEvent): void {
  const store = getStore();
  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }
  recomputeOutcomesFromEventWindow(store);

  const key = AGG_KEY(event);
  if (typeof event.value === "number" && (event.unit === "ms" || event.unit === undefined)) {
    bumpAgg(store.aggregates, key, event.value);
  }
  if (event.source === "client" && typeof event.value === "number") {
    bumpAgg(store.clientAggregates, key, event.value);
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
      const key = phase ? `realtime.subscription:phase:${phase}` : "realtime.subscription";
      maybeFailureRatioAlert(store, "subscriptionFailureRate", key, "realtime.subscription", "channel_subscribe");
    }
  }
  if (event.unit === "count" && event.category === "call.signaling" && event.metric === "signal_post" && event.labels?.outcome) {
    maybeFailureRatioAlert(store, "signalingFailureRate", "call.signaling", "call.signaling", "signal_post");
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
    store.alerts.splice(0, store.alerts.length - MAX_ALERTS);
  }
}

export function recordMessengerApiTiming(
  route: string,
  durationMs: number,
  status: number,
  options?: {
    category?: "api.community_messenger" | "api.integrated_chat";
    domain?: string;
  }
): void {
  const category = options?.category ?? "api.community_messenger";
  const domain = options?.domain ?? MESSENGER_MONITORING_LABEL_DOMAIN.community;
  const store = getStore();
  const cur = store.apiByRoute.get(route) ?? { count: 0, sum: 0, last: 0 };
  cur.count += 1;
  cur.sum += durationMs;
  cur.last = durationMs;
  store.apiByRoute.set(route, cur);

  recordMessengerMonitoringEvent({
    ts: Date.now(),
    category,
    metric: "route",
    source: "server",
    value: durationMs,
    unit: "ms",
    labels: {
      route,
      status: String(status),
      domain,
    },
  });
}

export function ingestClientMessengerEvents(events: MessengerMonitoringEvent[]): void {
  for (const e of events) {
    recordMessengerMonitoringEvent({ ...e, source: "client" });
  }
}

type ClientAggRow = { count: number; avg: number; last: number };

function findAgg(pool: Record<string, ClientAggRow>, substr: string): ClientAggRow | null {
  const hit = Object.entries(pool).find(([k]) => k.includes(substr));
  return hit ? hit[1] : null;
}

function buildSloDigest(
  store: Store,
  _aggregates: MessengerMonitoringSummary["aggregates"],
  clientAggregates: MessengerMonitoringSummary["clientAggregates"],
  apiByRoute: MessengerMonitoringSummary["apiByRoute"]
): MessengerSloDigestRow[] {
  const ref = MESSENGER_PERF_REFERENCE_P95_MS;
  const ratioRef = MESSENGER_PERF_REFERENCE_RATIOS;
  const rows: MessengerSloDigestRow[] = [];

  const roomsApi = apiByRoute["GET /api/community-messenger/rooms"];
  if (roomsApi) {
    rows.push({
      id: "room_list",
      label: "방 목록 API (서버)",
      unit: "ms",
      target: ref.roomListLoad.target,
      warning: ref.roomListLoad.warning,
      critical: ref.roomListLoad.critical,
      observedAvg: roomsApi.avgMs,
      observedLast: roomsApi.lastMs,
      sampleCount: roomsApi.count,
      sourceHint: "GET /api/community-messenger/rooms",
    });
  }

  const homeSyncApi = apiByRoute["GET /api/community-messenger/home-sync"];
  if (homeSyncApi) {
    rows.push({
      id: "home_sync",
      label: "홈 silent 묶음 API (서버)",
      unit: "ms",
      target: ref.homeSilentListSync.target,
      warning: ref.homeSilentListSync.warning,
      critical: ref.homeSilentListSync.critical,
      observedAvg: homeSyncApi.avgMs,
      observedLast: homeSyncApi.lastMs,
      sampleCount: homeSyncApi.count,
      sourceHint: "GET /api/community-messenger/home-sync",
    });
  }

  const bootClient = findAgg(clientAggregates, "chat.room_load:bootstrap_fetch:client");
  if (bootClient) {
    rows.push({
      id: "room_enter_client",
      label: "방 입장 부트스트랩 (클라 RTT)",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootClient.avg,
      observedLast: bootClient.last,
      sampleCount: bootClient.count,
      sourceHint: "chat.room_load / bootstrap_fetch",
    });
  }

  const bootApi = apiByRoute["GET /api/community-messenger/rooms/[roomId]/bootstrap"];
  if (bootApi) {
    rows.push({
      id: "room_bootstrap_server",
      label: "방 부트스트랩 HTTP (서버 라우트)",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootApi.avgMs,
      observedLast: bootApi.lastMs,
      sampleCount: bootApi.count,
      sourceHint: "GET /api/community-messenger/rooms/[roomId]/bootstrap",
    });
  }

  const send = findAgg(clientAggregates, "chat.message_latency:send_roundtrip:client");
  if (send) {
    rows.push({
      id: "message_send",
      label: "메시지 전송 RTT",
      unit: "ms",
      target: ref.sendAck.target,
      warning: ref.sendAck.warning,
      critical: ref.sendAck.critical,
      observedAvg: send.avg,
      observedLast: send.last,
      sampleCount: send.count,
      sourceHint: "chat.message_latency / send_roundtrip",
    });
  }

  const rt = findAgg(clientAggregates, "chat.realtime:message_insert_delay:client");
  if (rt) {
    rows.push({
      id: "realtime_delay",
      label: "Realtime 메시지 지연 (created_at→수신)",
      unit: "ms",
      target: ref.incomingDelivery.target,
      warning: ref.incomingDelivery.warning,
      critical: ref.incomingDelivery.critical,
      observedAvg: rt.avg,
      observedLast: rt.last,
      sampleCount: rt.count,
      sourceHint: "chat.realtime / message_insert_delay",
    });
  }

  const unread = findAgg(clientAggregates, "chat.unread_sync:badge_list_align:client");
  if (unread) {
    rows.push({
      id: "unread_sync",
      label: "미읽음·목록 정합 (읽음 처리 PATCH ~ 목록 반영)",
      unit: "ms",
      target: ref.unreadRefresh.target,
      warning: ref.unreadRefresh.warning,
      critical: ref.unreadRefresh.critical,
      observedAvg: unread.avg,
      observedLast: unread.last,
      sampleCount: unread.count,
      sourceHint: "chat.unread_sync / badge_list_align",
    });
  }

  const unreadList = findAgg(clientAggregates, "chat.unread_sync:list_bootstrap_align:client");
  if (unreadList) {
    rows.push({
      id: "unread_home_bootstrap",
      label: "홈 목록·탭 silent 부트스트랩 정합",
      unit: "ms",
      target: ref.homeSilentListSync.target,
      warning: ref.homeSilentListSync.warning,
      critical: ref.homeSilentListSync.critical,
      observedAvg: unreadList.avg,
      observedLast: unreadList.last,
      sampleCount: unreadList.count,
      sourceHint: "chat.unread_sync / list_bootstrap_align (GET /api/community-messenger/home-sync)",
    });
  }

  const call = findAgg(clientAggregates, "call.connection:first_connected:client");
  if (call) {
    rows.push({
      id: "call_connect",
      label: "통화 첫 연결 (음·영상 합산 집계)",
      unit: "ms",
      target: ref.voiceConnect.target,
      warning: ref.voiceConnect.warning,
      critical: ref.voiceConnect.critical,
      observedAvg: call.avg,
      observedLast: call.last,
      sampleCount: call.count,
      sourceHint: "call.connection / first_connected",
    });
  }

  const opened = store.callSessionsOpened.size;
  const withRe = store.callSessionsWithReconnect.size;
  if (opened > 0) {
    const rate = withRe / opened;
    rows.push({
      id: "reconnect_session_rate",
      label: "재연결 경험 세션 비율 (근사)",
      unit: "ratio",
      target: ratioRef.reconnectSessionRate.target,
      warning: ratioRef.reconnectSessionRate.warning,
      critical: ratioRef.reconnectSessionRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: opened,
      sourceHint: "callSessionsWithReconnect / callSessionsOpened",
    });
  }

  const sub = store.outcomes.get("realtime.subscription:phase:initial") ?? store.outcomes.get("realtime.subscription");
  if (sub && sub.ok + sub.fail > 0) {
    const rate = sub.fail / (sub.ok + sub.fail);
    rows.push({
      id: "subscription_fail_rate",
      label: "Realtime 채널 구독 실패율(초기 시도 기준)",
      unit: "ratio",
      target: ratioRef.subscriptionFailureRate.target,
      warning: ratioRef.subscriptionFailureRate.warning,
      critical: ratioRef.subscriptionFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: sub.ok + sub.fail,
      sourceHint: "realtime.subscription:phase:initial",
    });
  }

  const sig = store.outcomes.get("call.signaling");
  if (sig && sig.ok + sig.fail > 0) {
    const rate = sig.fail / (sig.ok + sig.fail);
    rows.push({
      id: "signaling_fail_rate",
      label: "시그널링 POST 실패율 (offer/answer/hangup)",
      unit: "ratio",
      target: ratioRef.signalingFailureRate.target,
      warning: ratioRef.signalingFailureRate.warning,
      critical: ratioRef.signalingFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: sig.ok + sig.fail,
      sourceHint: "call.signaling",
    });
  }

  return rows;
}

function buildOutcomeStats(store: Store): MessengerOutcomeStat[] {
  const out: MessengerOutcomeStat[] = [];
  for (const [key, v] of store.outcomes) {
    const n = v.ok + v.fail;
    out.push({
      key,
      ok: v.ok,
      fail: v.fail,
      failRate: n ? v.fail / n : 0,
    });
  }
  return out;
}

export function getMessengerMonitoringSummary(): MessengerMonitoringSummary {
  const store = getStore();
  const aggregates: MessengerMonitoringSummary["aggregates"] = {};
  for (const [k, v] of store.aggregates) {
    aggregates[k] = {
      count: v.count,
      sum: v.sum,
      avg: v.count ? v.sum / v.count : 0,
      last: v.last,
      lastAt: v.lastAt,
    };
  }
  const apiByRoute: MessengerMonitoringSummary["apiByRoute"] = {};
  for (const [route, v] of store.apiByRoute) {
    apiByRoute[route] = {
      count: v.count,
      avgMs: v.count ? v.sum / v.count : 0,
      lastMs: v.last,
    };
  }
  const clientAggregates: MessengerMonitoringSummary["clientAggregates"] = {};
  for (const [k, v] of store.clientAggregates) {
    clientAggregates[k] = {
      count: v.count,
      avg: v.count ? v.sum / v.count : 0,
      last: v.last,
    };
  }

  const opened = store.callSessionsOpened.size;
  const reconnectSessionRate = opened > 0 ? store.callSessionsWithReconnect.size / opened : null;

  return {
    generatedAt: new Date().toISOString(),
    windowEvents: store.events.length,
    aggregates,
    apiByRoute,
    recentAlerts: [...store.alerts].reverse(),
    clientAggregates,
    sloDigest: buildSloDigest(store, aggregates, clientAggregates, apiByRoute),
    outcomeStats: buildOutcomeStats(store),
    reconnectSessionRate,
  };
}
