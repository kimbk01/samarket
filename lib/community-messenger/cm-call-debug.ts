/**
 * 개발 전용 — 통화 발신 지연·오디오 정리 실측 로그.
 * `DEBUG_MESSENGER=true` 일 때만 — 기본 비활성.
 */

import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

function isCmCallDebugEnabled(): boolean {
  return isDebugMessengerEnabled();
}

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
  if (!isCmCallDebugEnabled() || typeof window === "undefined") return;
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
  if (!isCmCallDebugEnabled() || typeof window === "undefined") return;
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

let pendingIncomingCallerClickWallMs: number | null = null;
/** `POST .../calls` 직전 시각 — 세션 id 확정 후 `cmCallIncomingTraceBindSession` 에 합류 */
let pendingCallPostStartWallMs: number | null = null;

/** 전화 버튼 등 발신 제스처 시각 — 이후 단계에 sinceClick 계산 */
export function cmCallLatencyMarkClick(extra: Record<string, unknown> = {}): void {
  if (!isCmCallDebugEnabled() || typeof performance === "undefined") return;
  latencyAnchorMs = performance.now();
  if (typeof Date !== "undefined") {
    pendingIncomingCallerClickWallMs = Date.now();
  }
  cmCallLatencyInfo("call_button_click", { sinceClick: 0, ...extra });
}

/**
 * 통일 형식 (요청 스펙): console.info, step / t / sinceClick / sessionId / roomId / role / callKind
 */
export function cmCallLatencyInfo(step: string, extra: Record<string, unknown> = {}): void {
  if (!isCmCallDebugEnabled() || typeof performance === "undefined") return;
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
  if (!isCmCallDebugEnabled()) return;
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
  if (!isCmCallDebugEnabled()) return;
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
  if (!isCmCallDebugEnabled() || typeof performance === "undefined") return;
  console.info("[cm-call-flow]", {
    step,
    t: Math.round(performance.now() * 100) / 100,
    ...extra,
  });
}

/** 수신 지연 E2E — `Date.now()` 기준(탭 간 상관). 프로덕션 noop. */
export type CmCallIncomingE2eTrace = {
  caller_click_ms?: number;
  call_post_start_ms?: number;
  call_post_done_ms?: number;
  signal_emit_ms?: number;
  receiver_signal_received_ms?: number;
  receiver_incoming_ui_open_ms?: number;
  receiver_room_bootstrap_start_ms?: number;
  receiver_room_bootstrap_done_ms?: number;
};

const incomingE2eTraces = new Map<string, CmCallIncomingE2eTrace>();
/** ringing 수신 UI가 열린 동안 room bootstrap 상관용 */
const incomingRingingRoomToSessionId = new Map<string, string>();

const INCOMING_E2E_LS_PREFIX = "samarket.cm_call_incoming_e2e.";

/** 발신 탭 → 수신 탭: 동일 세션 id 로 caller_click·POST·signal_emit 상관 */
export function cmCallIncomingTracePublishToStorage(sessionId: string): void {
  if (!isCmCallDebugEnabled() || typeof localStorage === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;
  const row = incomingE2eTraces.get(sid);
  if (!row) return;
  try {
    localStorage.setItem(`${INCOMING_E2E_LS_PREFIX}${sid}`, JSON.stringify(row));
  } catch {
    /* quota / private mode */
  }
}

export function cmCallIncomingTraceMergeFromStorage(sessionId: string): void {
  if (!isCmCallDebugEnabled() || typeof localStorage === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;
  try {
    const raw = localStorage.getItem(`${INCOMING_E2E_LS_PREFIX}${sid}`);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CmCallIncomingE2eTrace;
    const cur = incomingE2eTraces.get(sid) ?? {};
    incomingE2eTraces.set(sid, { ...parsed, ...cur });
  } catch {
    /* ignore */
  }
}

export function cmCallIncomingTraceMarkCallPostStart(): void {
  if (!isCmCallDebugEnabled()) return;
  pendingCallPostStartWallMs = Date.now();
}

export function cmCallIncomingTraceBindSession(sessionId: string): void {
  if (!isCmCallDebugEnabled()) return;
  const sid = sessionId.trim();
  if (!sid) return;
  const cur = incomingE2eTraces.get(sid) ?? {};
  if (pendingIncomingCallerClickWallMs != null) {
    cur.caller_click_ms = pendingIncomingCallerClickWallMs;
    pendingIncomingCallerClickWallMs = null;
  }
  if (pendingCallPostStartWallMs != null) {
    cur.call_post_start_ms = pendingCallPostStartWallMs;
    pendingCallPostStartWallMs = null;
  }
  incomingE2eTraces.set(sid, cur);
}

export function cmCallIncomingTracePatch(
  sessionId: string,
  patch: Partial<CmCallIncomingE2eTrace>,
  opts?: { onlyIfUnset?: boolean }
): void {
  if (!isCmCallDebugEnabled()) return;
  const sid = sessionId.trim();
  if (!sid) return;
  const cur = incomingE2eTraces.get(sid) ?? {};
  const onlyIfUnset = opts?.onlyIfUnset === true;
  for (const [k, v] of Object.entries(patch) as [keyof CmCallIncomingE2eTrace, number | undefined][]) {
    if (v === undefined) continue;
    if (onlyIfUnset && cur[k] !== undefined) continue;
    (cur as Record<string, number>)[k as string] = v;
  }
  incomingE2eTraces.set(sid, cur);
}

export function cmCallIncomingTraceRegisterRingingRoom(sessionId: string, roomId: string): void {
  if (!isCmCallDebugEnabled()) return;
  const s = sessionId.trim();
  const r = roomId.trim();
  if (!s || !r) return;
  incomingRingingRoomToSessionId.set(r, s);
}

export function cmCallIncomingTraceClearRingingRoom(roomId: string): void {
  if (!isCmCallDebugEnabled()) return;
  incomingRingingRoomToSessionId.delete(roomId.trim());
}

export function cmCallIncomingTraceMaybeRoomBootstrap(roomId: string, phase: "start" | "done"): void {
  if (!isCmCallDebugEnabled()) return;
  const sid = incomingRingingRoomToSessionId.get(roomId.trim());
  if (!sid) return;
  const now = Date.now();
  if (phase === "start") {
    cmCallIncomingTracePatch(sid, { receiver_room_bootstrap_start_ms: now }, { onlyIfUnset: true });
    return;
  }
  const row = incomingE2eTraces.get(sid);
  if (row?.receiver_room_bootstrap_start_ms == null) return;
  cmCallIncomingTracePatch(sid, { receiver_room_bootstrap_done_ms: now }, { onlyIfUnset: true });
}

export function cmCallIncomingTraceLogTable(sessionId: string): void {
  if (!isCmCallDebugEnabled() || typeof console === "undefined") return;
  const sid = sessionId.trim();
  const row = incomingE2eTraces.get(sid);
  if (!row) return;
  const pick = (k: keyof CmCallIncomingE2eTrace) => row[k];
  const sig = pick("receiver_signal_received_ms");
  const ui = pick("receiver_incoming_ui_open_ms");
  const clk = pick("caller_click_ms");
  const rows: { metric: string; epoch_ms?: number; delta_ms?: number }[] = [
    { metric: "caller_click_ms", epoch_ms: clk },
    { metric: "call_post_start_ms", epoch_ms: pick("call_post_start_ms") },
    { metric: "call_post_done_ms", epoch_ms: pick("call_post_done_ms") },
    { metric: "signal_emit_ms", epoch_ms: pick("signal_emit_ms") },
    { metric: "receiver_signal_received_ms", epoch_ms: sig },
    { metric: "receiver_incoming_ui_open_ms", epoch_ms: ui },
    {
      metric: "delta_receiver_signal_to_ui",
      delta_ms: sig != null && ui != null ? ui - sig : undefined,
    },
    {
      metric: "delta_caller_click_to_receiver_ui",
      delta_ms: clk != null && ui != null ? ui - clk : undefined,
    },
    { metric: "receiver_room_bootstrap_start_ms", epoch_ms: pick("receiver_room_bootstrap_start_ms") },
    { metric: "receiver_room_bootstrap_done_ms", epoch_ms: pick("receiver_room_bootstrap_done_ms") },
  ];
  console.info("[cm-call-incoming-e2e]", { sessionIdSuffix: sid.slice(-8), ...row });
  if (typeof console.table === "function") {
    console.table(rows);
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`${INCOMING_E2E_LS_PREFIX}${sid}`);
    }
  } catch {
    /* ignore */
  }
}
