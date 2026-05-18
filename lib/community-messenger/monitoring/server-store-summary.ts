import type { MessageKey } from "@/lib/i18n/messages";
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

function sloRow(
  partial: Omit<MessengerSloDigestRow, "labelKey"> & {
    labelKey: MessageKey;
    labelVars?: Record<string, string | number>;
  }
): MessengerSloDigestRow {
  return partial;
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
    rows.push(
      sloRow({
      id: "room_list",
      labelKey: "admin_cm_slo_room_list",
      unit: "ms",
      target: ref.roomListLoad.target,
      warning: ref.roomListLoad.warning,
      critical: ref.roomListLoad.critical,
      observedAvg: roomsApi.avgMs,
      observedLast: roomsApi.lastMs,
      sampleCount: roomsApi.count,
      sourceHint: "GET /api/community-messenger/rooms",
    })
    );
  }

  const homeSyncApi = apiByRoute["GET /api/community-messenger/home-sync"];
  if (homeSyncApi) {
    rows.push(
      sloRow({
      id: "home_sync",
      labelKey: "admin_cm_slo_home_sync",
      unit: "ms",
      target: ref.homeSilentListSync.target,
      warning: ref.homeSilentListSync.warning,
      critical: ref.homeSilentListSync.critical,
      observedAvg: homeSyncApi.avgMs,
      observedLast: homeSyncApi.lastMs,
      sampleCount: homeSyncApi.count,
      sourceHint: "GET /api/community-messenger/home-sync",
    })
    );
  }

  const bootClient = findAgg(clientAggregates, "chat.room_load:bootstrap_fetch:client");
  if (bootClient) {
    rows.push(
      sloRow({
      id: "room_enter_client",
      labelKey: "admin_cm_slo_room_enter_client",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootClient.avg,
      observedLast: bootClient.last,
      sampleCount: bootClient.count,
      sourceHint: "chat.room_load / bootstrap_fetch",
    })
    );
  }

  const bootPrefix = "GET /api/community-messenger/rooms/[roomId]/bootstrap|";
  for (const [routeKey, bootApi] of Object.entries(apiByRoute)) {
    if (!routeKey.startsWith(bootPrefix)) continue;
    const cmReqSrc = routeKey.slice(bootPrefix.length);
    const safeId = cmReqSrc.replace(/[^a-z0-9_-]/gi, "_");
    rows.push(
      sloRow({
      id: `room_bootstrap_server_${safeId}`,
      labelKey: "admin_cm_slo_room_bootstrap_http",
      labelVars: { cmReqSrc },
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootApi.avgMs,
      observedLast: bootApi.lastMs,
      sampleCount: bootApi.count,
      sourceHint: `GET /api/community-messenger/rooms/[roomId]/bootstrap · ${cmReqSrc}`,
    })
    );
  }
  const bootLegacy = apiByRoute["GET /api/community-messenger/rooms/[roomId]/bootstrap"];
  if (bootLegacy) {
    rows.push(
      sloRow({
      id: "room_bootstrap_server_legacy_route_key",
      labelKey: "admin_cm_slo_room_bootstrap_legacy",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: bootLegacy.avgMs,
      observedLast: bootLegacy.lastMs,
      sampleCount: bootLegacy.count,
      sourceHint: "GET /api/community-messenger/rooms/[roomId]/bootstrap (legacy aggregate)",
    })
    );
  }

  const send = findAgg(clientAggregates, "chat.message_latency:send_roundtrip:client");
  if (send) {
    rows.push(
      sloRow({
      id: "message_send",
      labelKey: "admin_cm_slo_message_send",
      unit: "ms",
      target: ref.sendAck.target,
      warning: ref.sendAck.warning,
      critical: ref.sendAck.critical,
      observedAvg: send.avg,
      observedLast: send.last,
      sampleCount: send.count,
      sourceHint: "chat.message_latency / send_roundtrip",
    })
    );
  }

  const rt = findAgg(clientAggregates, "chat.realtime:message_insert_delay:client");
  if (rt) {
    rows.push(
      sloRow({
      id: "realtime_delay",
      labelKey: "admin_cm_slo_realtime_delay",
      unit: "ms",
      target: ref.incomingDelivery.target,
      warning: ref.incomingDelivery.warning,
      critical: ref.incomingDelivery.critical,
      observedAvg: rt.avg,
      observedLast: rt.last,
      sampleCount: rt.count,
      sourceHint: "chat.realtime / message_insert_delay",
    })
    );
  }

  const unread = findAgg(clientAggregates, "chat.unread_sync:badge_list_align:client");
  if (unread) {
    rows.push(
      sloRow({
      id: "unread_sync",
      labelKey: "admin_cm_slo_unread_sync",
      unit: "ms",
      target: ref.unreadRefresh.target,
      warning: ref.unreadRefresh.warning,
      critical: ref.unreadRefresh.critical,
      observedAvg: unread.avg,
      observedLast: unread.last,
      sampleCount: unread.count,
      sourceHint: "chat.unread_sync / badge_list_align",
    })
    );
  }

  const unreadList = findAgg(clientAggregates, "chat.unread_sync:list_bootstrap_align:client");
  if (unreadList) {
    rows.push(
      sloRow({
      id: "unread_home_bootstrap",
      labelKey: "admin_cm_slo_unread_home_bootstrap",
      unit: "ms",
      target: ref.unreadRefresh.target,
      warning: ref.unreadRefresh.warning,
      critical: ref.unreadRefresh.critical,
      observedAvg: unreadList.avg,
      observedLast: unreadList.last,
      sampleCount: unreadList.count,
      sourceHint: "chat.unread_sync / list_bootstrap_align",
    })
    );
  }

  const homeSyncFetchClient = findAgg(clientAggregates, "chat.unread_sync:home_sync_fetch_ms:client");
  if (homeSyncFetchClient) {
    rows.push(
      sloRow({
      id: "home_sync_fetch_client",
      labelKey: "admin_cm_slo_home_sync_fetch_client",
      unit: "ms",
      target: ref.homeSilentListSync.target,
      warning: ref.homeSilentListSync.warning,
      critical: ref.homeSilentListSync.critical,
      observedAvg: homeSyncFetchClient.avg,
      observedLast: homeSyncFetchClient.last,
      sampleCount: homeSyncFetchClient.count,
      sourceHint: "chat.unread_sync / home_sync_fetch_ms",
    })
    );
  }

  const silentFb = findAgg(clientAggregates, "chat.unread_sync:silent_fail_fallback_bootstrap_ms:client");
  if (silentFb) {
    rows.push(
      sloRow({
      id: "silent_fallback_bootstrap",
      labelKey: "admin_cm_slo_silent_fallback_bootstrap",
      unit: "ms",
      target: ref.roomBootstrap.target,
      warning: ref.roomBootstrap.warning,
      critical: ref.roomBootstrap.critical,
      observedAvg: silentFb.avg,
      observedLast: silentFb.last,
      sampleCount: silentFb.count,
      sourceHint: "chat.unread_sync / silent_fail_fallback_bootstrap_ms",
    })
    );
  }

  const call = findAgg(clientAggregates, "call.connection:first_connected:client");
  if (call) {
    rows.push(
      sloRow({
      id: "call_connect",
      labelKey: "admin_cm_slo_call_connect",
      unit: "ms",
      target: ref.voiceConnect.target,
      warning: ref.voiceConnect.warning,
      critical: ref.voiceConnect.critical,
      observedAvg: call.avg,
      observedLast: call.last,
      sampleCount: call.count,
      sourceHint: "call.connection / first_connected",
    })
    );
  }

  const frameBudget = findAgg(clientAggregates, "chat.render:frame_budget:client");
  if (frameBudget) {
    rows.push(
      sloRow({
      id: "frame_budget",
      labelKey: "admin_cm_slo_frame_budget",
      unit: "ms",
      target: MESSENGER_PERF_THRESHOLDS.frameBudgetTargetMs,
      warning: MESSENGER_PERF_THRESHOLDS.frameBudgetWarningMs,
      critical: MESSENGER_PERF_THRESHOLDS.frameBudgetCriticalMs,
      observedAvg: frameBudget.avg,
      observedLast: frameBudget.last,
      sampleCount: frameBudget.count,
      sourceHint: "chat.render / frame_budget",
    })
    );
  }

  const opened = store.callSessionsOpened.size;
  const withRe = store.callSessionsWithReconnect.size;
  if (opened > 0) {
    const rate = withRe / opened;
    rows.push(
      sloRow({
      id: "reconnect_session_rate",
      labelKey: "admin_cm_slo_reconnect_session_rate",
      unit: "ratio",
      target: ratioRef.reconnectSessionRate.target,
      warning: ratioRef.reconnectSessionRate.warning,
      critical: ratioRef.reconnectSessionRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: opened,
      sourceHint: "callSessionsWithReconnect / callSessionsOpened",
    })
    );
  }

  const sub = store.outcomes.get("realtime.subscription:phase:initial") ?? store.outcomes.get("realtime.subscription");
  if (sub && sub.ok + sub.fail > 0) {
    const rate = sub.fail / (sub.ok + sub.fail);
    rows.push(
      sloRow({
      id: "subscription_fail_rate",
      labelKey: "admin_cm_slo_subscription_fail_rate",
      unit: "ratio",
      target: ratioRef.subscriptionFailureRate.target,
      warning: ratioRef.subscriptionFailureRate.warning,
      critical: ratioRef.subscriptionFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: sub.ok + sub.fail,
      sourceHint: "realtime.subscription:phase:initial",
    })
    );
  }

  const cb = store.outcomes.get(OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK);
  if (cb && cb.ok + cb.fail > 0) {
    const rate = cb.fail / (cb.ok + cb.fail);
    rows.push(
      sloRow({
      id: "subscription_callback_fail_rate",
      labelKey: "admin_cm_slo_subscription_callback_fail_rate",
      unit: "ratio",
      target: ratioRef.subscriptionFailureRate.target,
      warning: ratioRef.subscriptionFailureRate.warning,
      critical: ratioRef.subscriptionFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: cb.ok + cb.fail,
      sourceHint: OUTCOME_CHANNEL_SUBSCRIBE_CALLBACK,
    })
    );
  }

  const sess = store.outcomes.get(OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL);
  if (sess && sess.ok + sess.fail > 0) {
    const rate = sess.fail / (sess.ok + sess.fail);
    rows.push(
      sloRow({
      id: "subscription_session_final_fail_rate",
      labelKey: "admin_cm_slo_subscription_session_final_fail_rate",
      unit: "ratio",
      target: ratioRef.subscriptionSessionFinalFailureRate.target,
      warning: ratioRef.subscriptionSessionFinalFailureRate.warning,
      critical: ratioRef.subscriptionSessionFinalFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: sess.ok + sess.fail,
      sourceHint: OUTCOME_CHANNEL_SUBSCRIBE_SESSION_FINAL,
    })
    );
  }

  const sig = store.outcomes.get("call.signaling");
  if (sig && sig.ok + sig.fail > 0) {
    const rate = sig.fail / (sig.ok + sig.fail);
    rows.push(
      sloRow({
      id: "signaling_fail_rate",
      labelKey: "admin_cm_slo_signaling_fail_rate",
      unit: "ratio",
      target: ratioRef.signalingFailureRate.target,
      warning: ratioRef.signalingFailureRate.warning,
      critical: ratioRef.signalingFailureRate.critical,
      observedAvg: rate,
      observedLast: rate,
      sampleCount: sig.ok + sig.fail,
      sourceHint: "call.signaling",
    })
    );
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
