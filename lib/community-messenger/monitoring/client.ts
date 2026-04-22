"use client";

import type { MessengerWebRtcDiagnosticsSample } from "./webrtc-stats";
import type { MessengerMonitoringEvent } from "./types";
import { logMessengerAlertDev, logMessengerMonitoringDev } from "./logger";
import { buildThresholdAlert, shouldAlertLatency, shouldAlertPacketLoss } from "./thresholds";

const FLUSH_BATCH = 24;
const FLUSH_INTERVAL_MS = 25_000;

let queue: MessengerMonitoringEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function roomSuffix(roomId: string): string {
  const t = roomId.trim();
  return t.length <= 8 ? t : t.slice(-8);
}

export function messengerMonitorRecord(partial: Omit<MessengerMonitoringEvent, "ts" | "source"> & { ts?: number }): void {
  const event: MessengerMonitoringEvent = {
    ...partial,
    ts: partial.ts ?? Date.now(),
    source: "client",
  };
  logMessengerMonitoringDev(event);
  if (event.unit === "ms" && typeof event.value === "number") {
    const breach = shouldAlertLatency(event.category, event.metric, event.value, event.labels);
    if (breach) {
      logMessengerAlertDev(buildThresholdAlert(breach, event.category, event.metric, event.value, event.labels));
    }
  }
  if (event.unit === "percent" && typeof event.value === "number" && event.category === "call.network") {
    if (shouldAlertPacketLoss(event.value)) {
      logMessengerAlertDev({
        ts: Date.now(),
        category: "call.network",
        metric: event.metric,
        threshold: Number(process.env.NEXT_PUBLIC_MESSENGER_PERF_PACKET_LOSS_PCT ?? 8),
        observed: event.value,
        message: `[messenger:perf:alert] 패킷 손실률 높음: ${event.value.toFixed(2)}%`,
        labels: event.labels,
      });
    }
  }
  queue.push(event);
  if (queue.length >= FLUSH_BATCH) {
    void flushMessengerMonitorQueue();
  } else {
    scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushMessengerMonitorQueue();
  }, FLUSH_INTERVAL_MS);
}

export async function flushMessengerMonitorQueue(): Promise<void> {
  if (queue.length === 0 || typeof window === "undefined") return;
  const batch = queue;
  queue = [];
  try {
    await fetch("/api/community-messenger/monitoring/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    /* ignore — best effort */
  }
}

/** 방 진입: fetch 부트스트랩 완료까지 (`silent` 는 콘솔 노이즈만 줄이고 전송 큐에는 동일 기록) */
export function messengerMonitorRoomLoad(
  roomId: string,
  durationMs: number,
  opts?: { silent?: boolean; cmReqSrc?: string }
): void {
  messengerMonitorRecord({
    category: "chat.room_load",
    metric: "bootstrap_fetch",
    value: durationMs,
    unit: "ms",
    labels: {
      roomIdSuffix: roomSuffix(roomId),
      refreshKind: opts?.silent ? "silent" : "foreground",
      ...(typeof opts?.cmReqSrc === "string" && opts.cmReqSrc.trim() ? { cmReqSrc: opts.cmReqSrc.trim() } : {}),
    },
  });
}

/** 텍스트/미디어 전송 요청 RTT (요청 시작 ~ 응답 수신) */
export function messengerMonitorMessageRtt(roomId: string, durationMs: number, kind: string): void {
  messengerMonitorRecord({
    category: "chat.message_latency",
    metric: "send_roundtrip",
    value: durationMs,
    unit: "ms",
    labels: { roomIdSuffix: roomSuffix(roomId), kind },
  });
}

/** 그룹·1:1 통화: 첫 원격 미디어 연결까지 — `media` 로 음성/영상 SLO 분리 */
export function messengerMonitorCallConnection(
  sessionId: string,
  durationMs: number,
  media?: "voice" | "video"
): void {
  messengerMonitorRecord({
    category: "call.connection",
    metric: "first_connected",
    value: durationMs,
    unit: "ms",
    labels: { sessionIdSuffix: sessionId.slice(-8), media: media ?? "voice" },
  });
}

/**
 * 1:1 직접통화 퍼널 — 세션 GET·수락·로컬 퍼블리시·상대 미디어 등 단계별 지연.
 * `metric` 은 `flow_call_*` 로 통일해 대시보드·임계값과 매핑한다.
 */
export function messengerMonitorCallFlowPhase(
  sessionId: string,
  metric:
    | "flow_call_session_shell"
    | "flow_call_outgoing_bootstrap"
    | "flow_call_accept_patch"
    | "flow_call_agora_publish"
    | "flow_call_accept_to_publish"
    | "flow_call_remote_after_publish"
    | "flow_call_incoming_surface_skew",
  durationMs: number,
  labels?: Record<string, string>
): void {
  messengerMonitorRecord({
    category: "call.connection",
    metric,
    value: durationMs,
    unit: "ms",
    labels: { sessionIdSuffix: sessionId.slice(-8), ...(labels ?? {}) },
  });
}

export function messengerMonitorCallPacketLoss(sessionId: string, percent: number): void {
  messengerMonitorRecord({
    category: "call.network",
    metric: "packet_loss_estimate",
    value: percent,
    unit: "percent",
    labels: { sessionIdSuffix: sessionId.slice(-8) },
  });
}

export function messengerMonitorCallReconnect(sessionId: string, count: number): void {
  messengerMonitorRecord({
    category: "call.reconnect",
    metric: "peer_transport_recovered",
    value: count,
    unit: "count",
    labels: { sessionIdSuffix: sessionId.slice(-8) },
  });
}

/** ICE restart offer 전송 시(자동 복구·수동 재시도) */
export function messengerMonitorCallIceRestart(sessionId: string, attempt: number): void {
  messengerMonitorRecord({
    category: "call.reconnect",
    metric: "ice_restart_offer",
    value: attempt,
    unit: "count",
    labels: { sessionIdSuffix: sessionId.slice(-8) },
  });
}

/** TURN 릴레이 강제로 PeerConnection 재생성 시 */
export function messengerMonitorCallTurnFallback(sessionId: string): void {
  messengerMonitorRecord({
    category: "call.reconnect",
    metric: "turn_relay_rebuild",
    value: 1,
    unit: "count",
    labels: { sessionIdSuffix: sessionId.slice(-8) },
  });
}

/** getStats 샘플 — 손실·RTT·후보 유형(릴레이 경로 여부 추정) */
/**
 * Realtime INSERT 메시지: DB `created_at` ~ 클라 수신 시각 (클럭 스큐 가능).
 * 극단적 미래 시각은 샘플에서 제외하는 것을 권장.
 */
export function messengerMonitorRealtimeMessageInsertDelay(roomId: string, latencyMs: number): void {
  messengerMonitorRecord({
    category: "chat.realtime",
    metric: "message_insert_delay",
    value: latencyMs,
    unit: "ms",
    labels: { roomIdSuffix: roomSuffix(roomId) },
  });
}

export type MessengerUnreadListSyncKind = "mark_read" | "room_open";

/** 미읽음·목록·배지 정합까지 관측된 지연 (호출부에서 측정) */
export function messengerMonitorUnreadListSync(
  roomId: string,
  latencyMs: number,
  kind: MessengerUnreadListSyncKind = "mark_read"
): void {
  messengerMonitorRecord({
    category: "chat.unread_sync",
    metric: "badge_list_align",
    value: latencyMs,
    unit: "ms",
    labels: { roomIdSuffix: roomSuffix(roomId), kind },
  });
}

/** 홈 silent 부트스트랩 완료까지 — Realtime 등으로 인한 목록·탭·미읽음 서버 정합 */
export function messengerMonitorHomeBootstrapUnreadSync(latencyMs: number): void {
  messengerMonitorRecord({
    category: "chat.unread_sync",
    metric: "list_bootstrap_align",
    value: latencyMs,
    unit: "ms",
    labels: { scope: "home_bootstrap" },
  });
}

/** Supabase 채널 `subscribe` 결과 — 홈/방 번들 등 scope 로 구분 */
export function messengerMonitorRealtimeSubscriptionOutcome(
  scope: string,
  ok: boolean,
  channelStatus?: string,
  extraLabels?: Record<string, string>
): void {
  messengerMonitorRecord({
    category: "realtime.subscription",
    metric: "channel_subscribe",
    value: 1,
    unit: "count",
    labels: {
      scope,
      outcome: ok ? "ok" : "error",
      ...(channelStatus ? { status: channelStatus } : {}),
      ...(extraLabels ?? {}),
    },
  });
}

/** SUBSCRIBED 상태가 유지돼도 payload가 한동안 안 들어오는 무음 구독 감지 */
export function messengerMonitorRealtimeSilentScope(
  scope: string,
  silentForMs: number,
  extraLabels?: Record<string, string>
): void {
  messengerMonitorRecord({
    category: "realtime.subscription",
    metric: "silent_channel",
    value: silentForMs,
    unit: "ms",
    labels: {
      scope,
      ...(extraLabels ?? {}),
    },
  });
}

/** 시그널링 HTTP POST (ICE 후보는 트래픽 폭주 방지로 제외) */
export function messengerMonitorSignalingPost(
  sessionId: string,
  signalType: "offer" | "answer" | "ice-candidate" | "hangup",
  ok: boolean,
  httpStatus?: number
): void {
  if (signalType === "ice-candidate") return;
  messengerMonitorRecord({
    category: "call.signaling",
    metric: "signal_post",
    value: 1,
    unit: "count",
    labels: {
      sessionIdSuffix: sessionId.slice(-8),
      signalType,
      outcome: ok ? "ok" : "error",
      ...(httpStatus != null ? { http: String(httpStatus) } : {}),
    },
  });
}

export function messengerMonitorCallWebRtcSample(sessionId: string, sample: MessengerWebRtcDiagnosticsSample): void {
  const suffix = sessionId.slice(-8);
  const labels: Record<string, string> = { sessionIdSuffix: suffix };
  if (sample.selectedLocalCandidateType) {
    labels.localCandidateType = sample.selectedLocalCandidateType;
  }
  if (sample.selectedRemoteCandidateType) {
    labels.remoteCandidateType = sample.selectedRemoteCandidateType;
  }
  if (sample.packetLossPercent != null) {
    messengerMonitorRecord({
      category: "call.network",
      metric: "packet_loss_estimate",
      value: sample.packetLossPercent,
      unit: "percent",
      labels,
    });
  }
  if (sample.roundTripTimeMs != null) {
    messengerMonitorRecord({
      category: "call.network",
      metric: "round_trip_time",
      value: sample.roundTripTimeMs,
      unit: "ms",
      labels,
    });
  }
  if (sample.jitterMs != null) {
    messengerMonitorRecord({
      category: "call.network",
      metric: "jitter",
      value: sample.jitterMs,
      unit: "ms",
      labels,
    });
  }
  const relay =
    sample.selectedLocalCandidateType === "relay" || sample.selectedRemoteCandidateType === "relay";
  messengerMonitorRecord({
    category: "call.connection",
    metric: "turn_path_used",
    value: relay ? 1 : 0,
    unit: "ratio",
    labels,
  });
}
