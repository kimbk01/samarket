/**
 * D2 실시간 연결 끊김 이유 진단 — 분류·집계 키·허용 표 (순수 함수, 클라이언트·서버 공용).
 * 설계: docs/audit/realtime-connection-drop-diagnostics-design-2026-11-09.md (Owner 「D2 구현 승인」 2026-11-09)
 *
 * 이상 상황만 기록한다(정상 심장박동 제외). 토큰 값·사용자 정보는 키에 들어가지 않는다 — 만료 여부만.
 */

export const REALTIME_CONNECTION_CATEGORY = "realtime.connection";
/** 이 이상 걸린 심장박동 응답만 `heartbeat_slow` 로 기록 */
export const REALTIME_HEARTBEAT_SLOW_MS = 5_000;

export type VisibilityBucket = "visible" | "hidden";
export type TokenBucket = "token_ok" | "token_expired" | "no_token";
export type CloseCodeBucket = "c1000" | "c1001" | "c1006" | "c4xxx" | "other";

const VIS = new Set<string>(["visible", "hidden"]);
const TOK = new Set<string>(["token_ok", "token_expired", "no_token"]);
const CODES = new Set<string>(["c1000", "c1001", "c1006", "c4xxx", "other"]);

export function visibilityBucket(state: unknown): VisibilityBucket {
  return state === "hidden" ? "hidden" : "visible";
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json =
      typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf8");
    const o = JSON.parse(json) as unknown;
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 실시간 연결에 붙은 JWT 의 만료 여부만 본다. anon 키·해석 불가는 `no_token`. */
export function tokenBucket(token: unknown, nowMs: number): TokenBucket {
  if (typeof token !== "string" || token.trim() === "") return "no_token";
  const p = decodeJwtPayload(token.trim());
  if (!p || p.role === "anon") return "no_token";
  const exp = typeof p.exp === "number" ? p.exp : NaN;
  if (!Number.isFinite(exp)) return "no_token";
  return exp * 1000 <= nowMs ? "token_expired" : "token_ok";
}

export function closeCodeBucket(code: unknown): CloseCodeBucket {
  if (code === 1000) return "c1000";
  if (code === 1001) return "c1001";
  if (code === 1006) return "c1006";
  if (typeof code === "number" && code >= 4000 && code <= 4999) return "c4xxx";
  return "other";
}

export const realtimeConnectionMetric = {
  heartbeatTimeout: (v: VisibilityBucket, t: TokenBucket) => `heartbeat_timeout.${v}.${t}`,
  heartbeatSlow: (v: VisibilityBucket) => `heartbeat_slow.${v}`,
  socketError: (v: VisibilityBucket, t: TokenBucket) => `socket_error.${v}.${t}`,
  socketClose: (c: CloseCodeBucket, v: VisibilityBucket, t: TokenBucket) => `socket_close.${c}.${v}.${t}`,
  socketReopen: (v: VisibilityBucket) => `socket_reopen.${v}`,
} as const;

/** 서버 검증: 허용 표와 정확히 일치하는 metric 만 받는다. */
export function isAllowedRealtimeConnectionMetric(metric: unknown): boolean {
  if (typeof metric !== "string") return false;
  const p = metric.split(".");
  switch (p[0]) {
    case "heartbeat_timeout":
    case "socket_error":
      return p.length === 3 && VIS.has(p[1]) && TOK.has(p[2]);
    case "heartbeat_slow":
    case "socket_reopen":
      return p.length === 2 && VIS.has(p[1]);
    case "socket_close":
      return p.length === 4 && CODES.has(p[1]) && VIS.has(p[2]) && TOK.has(p[3]);
    default:
      return false;
  }
}
