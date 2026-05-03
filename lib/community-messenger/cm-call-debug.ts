/**
 * 개발 전용 — 통화 발신 지연·오디오 정리 실측 로그.
 * 프로덕션(`NODE_ENV === "production"`): noop · 전역·버퍼 미설치.
 */

const isProdBuild =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

/** 로그·버퍼·콘솔 출력 — 운영 빌드 제외 */
const cmCallLatencyEnabled = !isProdBuild;

/** `[cm-call-audio-cleanup]` — 운영 빌드 제외( cmCallLatencyEnabled 와 동일) */
const cmCallAudioReportEnabled = !isProdBuild;

let latencyAnchorMs = 0;

const CM_LATENCY_BUFFER_MAX = 200;

export type CmLatencyBufferedEntry = {
  at: number;
  tag: "[cm-call-latency]" | "[cm-call-latency-analysis]";
  payload: Record<string, unknown>;
};

/** 최근 로그(링 버퍼) — 개발 클라이언트에서만 채움 */
export const CM_CALL_LATENCY_LOG_BUFFER: CmLatencyBufferedEntry[] = [];

function pushCmCallLatencyBuffer(
  tag: "[cm-call-latency]" | "[cm-call-latency-analysis]",
  payload: Record<string, unknown>
): void {
  if (!cmCallLatencyEnabled || typeof window === "undefined") return;
  CM_CALL_LATENCY_LOG_BUFFER.push({
    at: Date.now(),
    tag,
    payload,
  });
  while (CM_CALL_LATENCY_LOG_BUFFER.length > CM_LATENCY_BUFFER_MAX) {
    CM_CALL_LATENCY_LOG_BUFFER.shift();
  }
  installCmCallLatencyWindowHooks();
}

let cmLatencyWindowHooksInstalled = false;

function installCmCallLatencyWindowHooks(): void {
  if (!cmCallLatencyEnabled || typeof window === "undefined") return;
  if (cmLatencyWindowHooksInstalled) return;
  cmLatencyWindowHooksInstalled = true;
  try {
    const w = window as Window &
      Partial<{
        __CM_CALL_LATENCY_LOGS__: typeof CM_CALL_LATENCY_LOG_BUFFER;
        __copyCmCallLatencyLogs: () => Promise<string>;
      }>;
    w.__CM_CALL_LATENCY_LOGS__ = CM_CALL_LATENCY_LOG_BUFFER;
    w.__copyCmCallLatencyLogs = async () => {
      const json = JSON.stringify(CM_CALL_LATENCY_LOG_BUFFER, null, 2);
      try {
        await navigator.clipboard.writeText(json);
      } catch {
        /* 클립보드 거부·비보안 컨텍스트 등 */
      }
      return json;
    };
  } catch {
    /* ignore */
  }
}

export type CmCallLatencyRole = "initiator" | "recipient" | null;

export type CmCallLatencyContext = {
  sessionId?: string | null;
  roomId?: string | null;
  role?: CmCallLatencyRole;
  callKind?: "voice" | "video" | null;
};

let latencyContext: CmCallLatencyContext = {};

/** 통화 클라이언트·발신 셸에서 역할·종류를 한 번 설정하면 이후 로그에 합류 */
export function setCmCallLatencyContext(patch: Partial<CmCallLatencyContext>): void {
  latencyContext = { ...latencyContext, ...patch };
}

export function resetCmCallLatencyAnchor(): void {
  latencyAnchorMs = 0;
}

/** 전화 버튼 등 발신 제스처 시각 — 이후 단계에 sinceClick 계산 */
export function cmCallLatencyMarkClick(extra: Record<string, unknown> = {}): void {
  if (!cmCallLatencyEnabled || typeof performance === "undefined") return;
  latencyAnchorMs = performance.now();
  cmCallLatencyInfo("call_button_click", { sinceClick: 0, ...extra });
}

/**
 * 통일 형식 (요청 스펙): console.info, step / t / sinceClick / sessionId / roomId / role / callKind
 */
export function cmCallLatencyInfo(step: string, extra: Record<string, unknown> = {}): void {
  if (!cmCallLatencyEnabled || typeof performance === "undefined") return;
  const t = Math.round(performance.now() * 100) / 100;
  const sinceClick =
    latencyAnchorMs > 0 ? Math.round(t - latencyAnchorMs) : undefined;
  const {
    sessionId: exSid,
    roomId: exRid,
    role: exRole,
    callKind: exKind,
    ...rest
  } = extra as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    step,
    t,
    ...(sinceClick !== undefined ? { sinceClick } : {}),
    sessionId: exSid ?? latencyContext.sessionId ?? undefined,
    roomId: exRid ?? latencyContext.roomId ?? undefined,
    role: (exRole as CmCallLatencyRole | undefined) ?? latencyContext.role ?? undefined,
    callKind: (exKind as "voice" | "video" | undefined) ?? latencyContext.callKind ?? undefined,
    ...rest,
  };
  console.info("[cm-call-latency]", payload);
  pushCmCallLatencyBuffer("[cm-call-latency]", payload);
}

/** @deprecated Prefer cmCallLatencyInfo — 호환용 별칭 */
export function cmCallLatency(step: string, extra: Record<string, unknown> = {}): void {
  cmCallLatencyInfo(step, extra);
}

export function cmCallAudioCleanup(
  step: string,
  extra: Record<string, unknown> = {}
): void {
  if (!cmCallAudioReportEnabled) return;
  console.info("[cm-call-audio-cleanup]", {
    ...extra,
    step,
    sessionId: extra.sessionId,
    reason: extra.reason,
    localAudioClosed: extra.localAudioClosed,
    localVideoClosed: extra.localVideoClosed,
    remoteTrackCount: extra.remoteTrackCount,
    mediaElementCount: extra.mediaElementCount,
    audioContextState: extra.audioContextState,
    speakerRestored: extra.speakerRestored,
    t: Date.now(),
  });
}

type CallSessionServerTimings = {
  db_insert_rpc_ms?: number;
  resolve_room_context_ms?: number;
  pre_insert_gate_ms?: number;
  map_session_ms?: number;
};

/** POST 왕복에서 DB vs 네트워크 쪽 기여도를 자동 분류(개발만). */
export function cmCallLatencyAnalysis(args: {
  totalMs: number | undefined;
  serverMs: CallSessionServerTimings | undefined;
}): void {
  if (!cmCallLatencyEnabled) return;
  const durationMs = args.totalMs ?? 0;
  const dbRpc = args.serverMs?.db_insert_rpc_ms ?? 0;
  const networkMs = durationMs - dbRpc;
  const suspectedBottleneck: "OK" | "DB" | "NETWORK" =
    durationMs > 3000
      ? dbRpc > durationMs * 0.5
        ? "DB"
        : "NETWORK"
      : "OK";
  const payload: Record<string, unknown> = {
    totalMs: durationMs,
    serverMs: args.serverMs,
    networkMs,
    suspectedBottleneck,
  };
  console.info("[cm-call-latency-analysis]", payload);
  pushCmCallLatencyBuffer("[cm-call-latency-analysis]", payload);
}

/**
 * 발신→수신→연결 시그널 구간 측정(비프로덕션만). 통화 로직·상태는 건드리지 않는다.
 */
export function cmCallFlow(step: string, extra: Record<string, unknown> = {}): void {
  if (!cmCallLatencyEnabled || typeof performance === "undefined") return;
  console.info("[cm-call-flow]", {
    step,
    t: Math.round(performance.now() * 100) / 100,
    ...extra,
  });
}
