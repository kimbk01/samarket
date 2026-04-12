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

/** 기본 임계값 — 필요 시 env 로 덮어쓸 수 있게 설계 (알림 = 치명 구간에 가깝게 동작) */
export const MESSENGER_PERF_THRESHOLDS = {
  /** 방 부트스트랩(HTTP) 완료까지 */
  roomLoadMs: Number(process.env.MESSENGER_PERF_ROOM_LOAD_MS ?? 4000),
  /** 메시지 전송 요청 RTT */
  messageLatencyMs: Number(process.env.MESSENGER_PERF_MESSAGE_MS ?? 2500),
  /** 통화 미디어 연결(첫 connected)까지 */
  callConnectionMs: Number(process.env.MESSENGER_PERF_CALL_CONNECT_MS ?? 12000),
  /** 추정 패킷 손실률 (%) */
  packetLossPercent: Number(process.env.MESSENGER_PERF_PACKET_LOSS_PCT ?? 8),
  /** 단일 API 핸들러 (서버 측) */
  apiMs: Number(process.env.MESSENGER_PERF_API_MS ?? 2000),
  /** DB/서비스 레이어 한 구간 */
  dbMs: Number(process.env.MESSENGER_PERF_DB_MS ?? 800),
} as const;

export function shouldAlertLatency(
  category: MessengerMonitoringCategory,
  metric: string,
  valueMs: number
): keyof typeof MESSENGER_PERF_THRESHOLDS | null {
  if (category === "chat.room_load" && metric === "bootstrap_fetch") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.roomLoadMs ? "roomLoadMs" : null;
  }
  if (category === "chat.message_latency" && metric === "send_roundtrip") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.messageLatencyMs ? "messageLatencyMs" : null;
  }
  if (category === "call.connection" && metric === "first_connected") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.callConnectionMs ? "callConnectionMs" : null;
  }
  if (category === "api.community_messenger") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.apiMs ? "apiMs" : null;
  }
  if (category === "db.community_messenger") {
    return valueMs > MESSENGER_PERF_THRESHOLDS.dbMs ? "dbMs" : null;
  }
  return null;
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
