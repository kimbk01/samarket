import type {
  MessengerMonitoringSummary,
  MessengerOutcomeStat,
  MessengerSloDigestRow,
} from "./types";
import {
  MESSENGER_PERF_REFERENCE_P95_MS,
  MESSENGER_PERF_REFERENCE_RATIOS,
  MESSENGER_PERF_THRESHOLDS,
} from "./thresholds";
import {
  getMessengerMonitoringStoreRoot,
  type MessengerMonitoringStore as Store,
} from "./server-store-root";

const OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK = "realtime.subscription:channel_subscribe_callback";
const OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL = "realtime.subscription:channel_subscribe_session_final";

const getStore = getMessengerMonitoringStoreRoot;

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

  const bootPrefix = "GET /api/community-messenger/rooms/[roomId]/bootstrap|";
  for (const [routeKey, bootApi] of Object.entries(apiByRoute)) {
    if (!routeKey.startsWith(bootPrefix)) continue;
    const cmReqSrc = routeKey.slice(bootPrefix.length);
    const safeId = cmReqSrc.replace(/[^a-z0-9_-]/gi, "_");
    rows.push({
      id: `room_bootstrap_server_${safeId}`,
      label: `방 부트스트랩 HTTP (cmReqSrc=${cmReqSrc})`,
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootApi.avgMs,
      observedLast: bootApi.lastMs,
      sampleCount: bootApi.count,
      sourceHint: `GET /api/community-messenger/rooms/[roomId]/bootstrap · ${cmReqSrc}`,
    });
  }
  const bootLegacy = apiByRoute["GET /api/community-messenger/rooms/[roomId]/bootstrap"];
  if (bootLegacy) {
    rows.push({
      id: "room_bootstrap_server_legacy_route_key",
      label: "방 부트스트랩 HTTP (구 apiByRoute 키, cmReqSrc 미분리)",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootLegacy.avgMs,
      observedLast: bootLegacy.lastMs,
      sampleCount: bootLegacy.count,
      sourceHint: "GET /api/community-messenger/rooms/[roomId]/bootstrap (레거시 집계)",
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
      label: "홈 목록 UI 정합 (merge·세션 캐시)",
      unit: "ms",
      target: ref.unreadRefresh.target,
      warning: ref.unreadRefresh.warning,
      critical: ref.unreadRefresh.critical,
      observedAvg: unreadList.avg,
      observedLast: unreadList.last,
      sampleCount: unreadList.count,
      sourceHint: "chat.unread_sync / list_bootstrap_align — mergeHomeSyncIntoBootstrap 동기 구간만",
    });
  }

  const homeSyncFetchClient = findAgg(clientAggregates, "chat.unread_sync:home_sync_fetch_ms:client");
  if (homeSyncFetchClient) {
    rows.push({
      id: "home_sync_fetch_client",
      label: "홈 silent home-sync (클라 네트워크)",
      unit: "ms",
      target: ref.homeSilentListSync.target,
      warning: ref.homeSilentListSync.warning,
      critical: ref.homeSilentListSync.critical,
      observedAvg: homeSyncFetchClient.avg,
      observedLast: homeSyncFetchClient.last,
      sampleCount: homeSyncFetchClient.count,
      sourceHint: "chat.unread_sync / home_sync_fetch_ms — GET /api/community-messenger/home-sync 왕복",
    });
  }

  const silentFb = findAgg(clientAggregates, "chat.unread_sync:silent_fail_fallback_bootstrap_ms:client");
  if (silentFb) {
    rows.push({
      id: "silent_fallback_bootstrap",
      label: "silent 실패 시 fresh 부트스트랩 (클라)",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: silentFb.avg,
      observedLast: silentFb.last,
      sampleCount: silentFb.count,
      sourceHint: "chat.unread_sync / silent_fail_fallback_bootstrap_ms",
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

  const frameBudget = findAgg(clientAggregates, "chat.render:frame_budget:client");
  if (frameBudget) {
    rows.push({
      id: "frame_budget",
      label: "클라 프레임 예산 (frame_budget · NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET=1)",
      unit: "ms",
      target: MESSENGER_PERF_THRESHOLDS.frameBudgetTargetMs,
      warning: MESSENGER_PERF_THRESHOLDS.frameBudgetWarningMs,
      critical: MESSENGER_PERF_THRESHOLDS.frameBudgetCriticalMs,
      observedAvg: frameBudget.avg,
      observedLast: frameBudget.last,
      sampleCount: frameBudget.count,
      sourceHint: "chat.render / frame_budget",
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
      label: "Realtime 구독 초기 시도 실패율·raw 콜백 (phase:initial)",
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

  const cb = store.outcomes.get(OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK);
  if (cb && cb.ok + cb.fail > 0) {
    const rate = cb.fail / (cb.ok + cb.fail);
    rows.push({
      id: "subscription_callback_fail_rate",
      label: "Realtime channel_subscribe 콜백 실패율(모든 시도·HS4 raw)",
      unit: "ratio",
      target: ratioRef.subscriptionFailureRate.target,
      warning: ratioRef.subscriptionFailureRate.warning,
      critical: ratioRef.subscriptionFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: cb.ok + cb.fail,
      sourceHint: OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK,
    });
  }

  const sess = store.outcomes.get(OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL);
  if (sess && sess.ok + sess.fail > 0) {
    const rate = sess.fail / (sess.ok + sess.fail);
    rows.push({
      id: "subscription_session_final_fail_rate",
      label: "Realtime 구독 세션 최종 실패율(recovered transient 제외)",
      unit: "ratio",
      target: ratioRef.subscriptionSessionFinalFailureRate.target,
      warning: ratioRef.subscriptionSessionFinalFailureRate.warning,
      critical: ratioRef.subscriptionSessionFinalFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: sess.ok + sess.fail,
      sourceHint: OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL,
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
    latestBootstrapBreakdown: store.latestBootstrapBreakdown,
  };
}
