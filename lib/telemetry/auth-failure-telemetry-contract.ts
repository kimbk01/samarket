/**
 * 로그인 실패·취소 서버 기록 계약 (클라이언트·서버 공용, 순수 함수).
 * 근거: docs/audit/auth-login-failure-server-record-design-2026-11-16.md (Owner 「구현·DB 적용 승인」 2026-11-16).
 *
 * 금지: 사용자 ID·이메일·토큰·nonce·오류 설명 원문·IP·User-Agent 수집. 화이트리스트 필드만 통과한다.
 */

export const AUTH_FAILURE_TELEMETRY_SCHEMA_VERSION = 1;
export const AUTH_FAILURE_TELEMETRY_ENDPOINT = "/api/telemetry/auth-failure";
export const AUTH_FAILURE_TELEMETRY_LOG_TAG = "[dibay-auth-failure]";
export const AUTH_FAILURE_TELEMETRY_MAX_BODY_BYTES = 2048;
/** 로그인 1회 걸린 시간 상한 24시간 — 넘으면 상한값으로 고정. */
export const AUTH_FAILURE_MAX_ELAPSED_MS = 24 * 3_600_000;

export const AUTH_FAILURE_RESULTS = ["fail", "cancel"] as const;
export type AuthFailureResult = (typeof AUTH_FAILURE_RESULTS)[number];

export type AuthFailureTelemetryEvent = {
  v: number;
  /** 로그인 1회 무작위 ID (`af_…`) — 교환 요청 `x-dibay-auth-flow-id` 와 같다. 사용자와 연결하지 않는다. */
  authFlowId: string;
  result: AuthFailureResult;
  provider: string;
  platform: string;
  flowKind: string | null;
  errorCode: string | null;
  reason: string | null;
  lastStage: string | null;
  elapsedMs: number;
  /** 플랫폼 인증 오류 번호 (Apple ASAuthorizationError 1000 등) — 숫자만. */
  nativeErrorCode: number | null;
  appVersion: string | null;
  appBuild: string | null;
  webSha: string | null;
};

const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const FLOW_ID_RE = /^af_[A-Za-z0-9]{6,32}$/;

function asToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return TOKEN_RE.test(s) ? s : null;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function asNativeErrorCode(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= -999_999 && value <= 999_999 ? value : null;
}

/** 계약 필드만 남겨 정규화. 필수 필드가 틀리면 null (기록하지 않음). 알 수 없는 필드는 버린다. */
export function sanitizeAuthFailureTelemetryEvent(raw: unknown): AuthFailureTelemetryEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== AUTH_FAILURE_TELEMETRY_SCHEMA_VERSION) return null;
  const authFlowId = typeof r.authFlowId === "string" && FLOW_ID_RE.test(r.authFlowId) ? r.authFlowId : null;
  const result = asEnum(r.result, AUTH_FAILURE_RESULTS);
  const provider = asToken(r.provider);
  const platform = asToken(r.platform);
  const elapsed = typeof r.elapsedMs === "number" && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0
    ? Math.round(Math.min(r.elapsedMs, AUTH_FAILURE_MAX_ELAPSED_MS))
    : null;
  if (!authFlowId || !result || !provider || !platform || elapsed == null) return null;
  return {
    v: AUTH_FAILURE_TELEMETRY_SCHEMA_VERSION,
    authFlowId,
    result,
    provider,
    platform,
    flowKind: asToken(r.flowKind),
    errorCode: asToken(r.errorCode),
    reason: asToken(r.reason),
    lastStage: asToken(r.lastStage),
    elapsedMs: elapsed,
    nativeErrorCode: asNativeErrorCode(r.nativeErrorCode),
    appVersion: asToken(r.appVersion),
    appBuild: asToken(r.appBuild),
    webSha: asToken(r.webSha),
  };
}

/**
 * Apple 오류 설명에서 ASAuthorizationError 번호만 뽑는다 (설명 원문은 보내지 않는다).
 * 예: "The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)"
 * 언어별 문구가 달라도 도메인 이름 뒤 첫 숫자를 쓴다. 없으면 null.
 */
export function parseAppleAuthorizationErrorCode(text: unknown): number | null {
  if (typeof text !== "string" || !text) return null;
  const m = /AuthorizationError\D{0,24}?(\d{3,5})/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}
