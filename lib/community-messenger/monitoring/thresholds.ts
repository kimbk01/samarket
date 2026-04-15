import type { MessengerMonitoringAlert, MessengerMonitoringCategory } from "./types";

/**
 * 카카오톡·LINE급 **참조 목표** (p95, ms). 알림 한도(`MESSENGER_PERF_*`)와 별개.
 * 상세·경고·치명·병목·완화 표: `docs/messenger-performance-targets.md`
 */
export const MESSENGER_PERF_REFERENCE_P95_MS = {
  roomListLoad: { target: 400, warning: 800, critical: 1500 },
  roomBootstrap: { target: 500, warning: 1000, critical: 2000 },
  recentMessageRender: { target: 100, warning: 250, critical: 500 },
  sendAck: { target: 200, warning: 500, critical: 1500 },
  incomingDelivery: { target: 300, warning: 800, critical: 2000 },
  unreadRefresh: { target: 200, warning: 500, critical: 1000 },
  /** 홈 silent `home-sync` 1회 (클라 `list_bootstrap_align`) — 3 API 합류 전과 동일 부하·RTT 상한 참고 */
  homeSilentListSync: { target: 600, warning: 1200, critical: 2000 },
  voiceConnect: { target: 2000, warning: 4000, critical: 8000 },
  videoConnect: { target: 3000, warning: 6000, critical: 12000 },
  groupJoin: { target: 1000, warning: 3000, critical: 8000 },
  reconnect: { target: 2000, warning: 5000, critical: 15000 },
} as const;

/** 설계 한도 — `messenger-performance-targets.md` §2 와 동기 */
export const MESSENGER_PERF_DESIGN_LIMITS = {
  maxApisOnRoomEnter: { ok: 3, warn: 5, critical: 8 },
  bootstrapPayloadGzipBytes: { ok: 80 * 1024, warn: 150 * 1024, critical: 250 * 1024 },
  messagesBeforeVirtualization: { ok: 50, warn: 80, critical: 120 },
  /** 그룹 채팅 최적화 모드 전환 인원 — docs/group-chat-ui-performance.md */
  groupParticipantsOptimize: { review: 50, required: 100, strict: 200 },
} as const;

/** 비율·건수 SLO 참조 (실패율 = 실패/시도) — `messenger-performance-targets.md` 운영안과 정합 */
export const MESSENGER_PERF_REFERENCE_RATIOS = {
  reconnectSessionRate: { target: 0.01, warning: 0.03, critical: 0.05 },
  subscriptionFailureRate: { target: 0.001, warning: 0.01, critical: 0.05 },
  signalingFailureRate: { target: 0.001, warning: 0.01, critical: 0.05 },
} as const;

/** 기본 임계값 — 필요 시 env 로 덮어쓸 수 있게 설계 (알림 = 치명 구간에 가깝게 동작) */
export const MESSENGER_PERF_THRESHOLDS = {
  /** 방 부트스트랩(HTTP) 완료까지 */
  roomLoadMs: Number(process.env.MESSENGER_PERF_ROOM_LOAD_MS ?? 4000),
  /** 메시지 전송 요청 RTT */
  messageLatencyMs: Number(process.env.MESSENGER_PERF_MESSAGE_MS ?? 2500),
  /** 통화 미디어 연결(첫 connected)까지 — 레거시 단일 키(음성·영상 분리 시 voice/video 우선) */
  callConnectionMs: Number(process.env.MESSENGER_PERF_CALL_CONNECT_MS ?? 12000),
  /** 음성 통화 첫 연결 (ms) */
  voiceConnectMs: Number(process.env.MESSENGER_PERF_VOICE_CONNECT_MS ?? process.env.MESSENGER_PERF_CALL_CONNECT_MS ?? 12000),
  /** 영상 통화 첫 연결 (ms) */
  videoConnectMs: Number(process.env.MESSENGER_PERF_VIDEO_CONNECT_MS ?? process.env.MESSENGER_PERF_CALL_CONNECT_MS ?? 12000),
  /** Realtime 메시지 INSERT ~ 클라 수신 지연 (ms) */
  realtimeEventDelayMs: Number(process.env.MESSENGER_PERF_REALTIME_EVENT_MS ?? 2000),
  /** 미읽음·목록·배지 정합 지연 (ms) — `badge_list_align` 등 가벼운 동기 */
  unreadSyncDelayMs: Number(process.env.MESSENGER_PERF_UNREAD_SYNC_MS ?? 1000),
  /** 홈 silent `list_bootstrap_align` — rooms·요청·친구 묶음 1회 RTT·Supabase 병렬 구간 (1000ms는 과도한 오탐) */
  homeListSyncMs: Number(process.env.MESSENGER_PERF_HOME_LIST_SYNC_MS ?? 2000),
  /** 추정 패킷 손실률 (%) */
  packetLossPercent: Number(process.env.MESSENGER_PERF_PACKET_LOSS_PCT ?? 8),
  /** 단일 API 핸들러 (서버 측) */
  apiMs: Number(process.env.MESSENGER_PERF_API_MS ?? 2000),
  /** DB/서비스 레이어 한 구간 */
  dbMs: Number(process.env.MESSENGER_PERF_DB_MS ?? 800),
  /** 탭→방 마운트(클라) */
  roomTapToMountMs: Number(process.env.MESSENGER_PERF_ROOM_TAP_TO_MOUNT_MS ?? 1200),
  /** 방→리스트 마운트(클라) */
  roomToListMountMs: Number(process.env.MESSENGER_PERF_ROOM_TO_LIST_MOUNT_MS ?? 900),
  /** 재연결 세션 비율 (0~1) — 알림용 */
  reconnectSessionRateCritical: Number(process.env.MESSENGER_PERF_RECONNECT_SESSION_RATE ?? 0.05),
  subscriptionFailRateCritical: Number(process.env.MESSENGER_PERF_SUBSCRIPTION_FAIL_RATE ?? 0.05),
  signalingFailRateCritical: Number(process.env.MESSENGER_PERF_SIGNALING_FAIL_RATE ?? 0.05),
} as const;

const RATIO_MIN_SAMPLES = Number(process.env.MESSENGER_PERF_RATIO_MIN_SAMPLES ?? 8);

export function shouldAlertLatency(
  category: MessengerMonitoringCategory,
  metric: string,
  valueMs: number,
  labels?: Record<string, string>
): keyof typeof MESSENGER_PERF_THRESHOLDS | null {
  if (category === "chat.room_load" && metric === "bootstrap_fetch") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.roomLoadMs ? "roomLoadMs" : null;
  }
  if (category === "chat.message_latency" && metric === "send_roundtrip") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.messageLatencyMs ? "messageLatencyMs" : null;
  }
  if (category === "call.connection" && metric === "first_connected") {
    const isVideo = labels?.media === "video";
    const cap = isVideo ? MESSENGER_PERF_THRESHOLDS.videoConnectMs : MESSENGER_PERF_THRESHOLDS.voiceConnectMs;
    return valueMs > cap ? (isVideo ? "videoConnectMs" : "voiceConnectMs") : null;
  }
  if (category === "call.connection" && metric.startsWith("flow_call_")) {
    /* 링 시작(서버 시각)~클라 목록 반영 — 시계 편차·백그라운드 탭으로 값이 커질 수 있음 */
    if (metric === "flow_call_incoming_surface_skew") return null;
    const isVideo = labels?.media === "video";
    const cap = isVideo ? MESSENGER_PERF_THRESHOLDS.videoConnectMs : MESSENGER_PERF_THRESHOLDS.voiceConnectMs;
    return valueMs > cap ? (isVideo ? "videoConnectMs" : "voiceConnectMs") : null;
  }
  if (category === "chat.realtime" && metric === "message_insert_delay") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.realtimeEventDelayMs ? "realtimeEventDelayMs" : null;
  }
  if (category === "chat.unread_sync" && metric === "badge_list_align") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.unreadSyncDelayMs ? "unreadSyncDelayMs" : null;
  }
  if (category === "chat.unread_sync" && metric === "list_bootstrap_align") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.homeListSyncMs ? "homeListSyncMs" : null;
  }
  if (category === "api.community_messenger" || category === "api.integrated_chat") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.apiMs ? "apiMs" : null;
  }
  if (category === "db.community_messenger") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.dbMs ? "dbMs" : null;
  }
  if (category === "chat.room_nav" && metric === "tap_to_mount") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.roomTapToMountMs ? "roomTapToMountMs" : null;
  }
  if (category === "chat.room_nav" && metric === "room_to_list_mount") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.roomToListMountMs ? "roomToListMountMs" : null;
  }
  return null;
}

/** 실패율(0~1) 치명 구간 초과 여부 — 충분한 샘플 이후에만 */
export function shouldAlertFailureRate(kind: keyof typeof MESSENGER_PERF_REFERENCE_RATIOS, failRate: number, attempts: number): boolean {
  if (attempts < RATIO_MIN_SAMPLES) return false;
  const critical =
    kind === "reconnectSessionRate"
      ? MESSENGER_PERF_THRESHOLDS.reconnectSessionRateCritical
      : kind === "subscriptionFailureRate"
        ? MESSENGER_PERF_THRESHOLDS.subscriptionFailRateCritical
        : MESSENGER_PERF_THRESHOLDS.signalingFailRateCritical;
  return failRate >= critical;
}

export function shouldAlertPacketLoss(percent: number): boolean {
  return percent > MESSENGER_PERF_THRESHOLDS.packetLossPercent;
}

export function buildThresholdAlert(
  key: keyof typeof MESSENGER_PERF_THRESHOLDS,
  category: MessengerMonitoringCategory,
  metric: string,
  observed: number,
  labels?: Record<string, string>
): MessengerMonitoringAlert {
  const threshold = MESSENGER_PERF_THRESHOLDS[key];
  return {
    ts: Date.now(),
    category,
    metric,
    threshold,
    observed,
    message: `[messenger-perf] ${category}/${metric} 임계 초과: ${observed.toFixed(1)} (기준 ${threshold})`,
    labels,
  };
}

export function buildFailureRateAlert(
  category: MessengerMonitoringCategory,
  metric: string,
  failRate: number,
  threshold: number,
  labels?: Record<string, string>
): MessengerMonitoringAlert {
  return {
    ts: Date.now(),
    category,
    metric,
    threshold,
    observed: failRate,
    message: `[messenger-perf] ${category}/${metric} 실패율 치명: ${(failRate * 100).toFixed(2)}% (기준 ${(threshold * 100).toFixed(2)}%)`,
    labels,
  };
}
