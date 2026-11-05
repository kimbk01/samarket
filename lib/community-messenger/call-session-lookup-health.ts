import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

/**
 * 통화 화면 `GET /calls/sessions/:id` 결과 분류.
 * - `not_found`: 서버 DB 기준 행 없음·참여자 아님(404) — 단 1회만으로 부재를 확정하지 않는다
 * - `auth_required`: 401 — 자동 재시도하지 않는다(인증 복구는 앱 인증 흐름 소관)
 * - `rate_limited`: 429 — Retry-After 만큼 대기
 * - `transient`: 5xx·503·네트워크 단절·형식 오류 — 행 유무 미확인, 기존 세션 보존
 */
export type CallSessionFetchOutcome =
  | { kind: "ok"; session: CommunityMessengerCallSession }
  | { kind: "not_found" }
  | { kind: "auth_required" }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "transient" };

export const CALL_SESSION_LOOKUP_RETRY = {
  transientBaseMs: 2_000,
  transientMaxMs: 30_000,
  /** 연속 일시 실패가 이만큼 쌓이면 자동 재시도 중단 — 온라인 복귀·화면 복귀·Realtime 신호로만 재개 */
  maxConsecutiveTransient: 6,
  rateLimitMaxMs: 120_000,
  /** 404 확정에 필요한 두 번째 404 와의 최소 간격 */
  notFoundConfirmGapMs: 1_500,
} as const;

export function classifyCallSessionFetchResponse(
  status: number,
  json: { ok?: boolean; session?: CommunityMessengerCallSession | null } | null,
  retryAfterHeader: string | null
): CallSessionFetchOutcome {
  if (status >= 200 && status < 300) {
    if (json?.ok && json.session?.id) return { kind: "ok", session: json.session };
    return { kind: "transient" };
  }
  if (status === 404) return { kind: "not_found" };
  if (status === 401) return { kind: "auth_required" };
  if (status === 429) {
    const sec = Number.parseInt(retryAfterHeader ?? "", 10);
    const ms = (Number.isFinite(sec) && sec > 0 ? sec : 5) * 1_000;
    return { kind: "rate_limited", retryAfterMs: Math.min(CALL_SESSION_LOOKUP_RETRY.rateLimitMaxMs, ms) };
  }
  return { kind: "transient" };
}

export type CallSessionLookupDecision =
  /** 서버 세션을 반영 */
  | { action: "apply"; session: CommunityMessengerCallSession }
  /** 기존 세션 유지 — `retryAt` 이 있으면 그 시각 이후 재조회(없으면 자동 재조회 없음) */
  | { action: "keep"; retryAt: number | null }
  /** 404 두 번(간격 충족·사이에 성공 없음) — 이 sessionId 는 서버에 없거나 내 통화가 아님 */
  | { action: "not_found_confirmed" };

export type CallSessionLookupHealth = {
  readonly sessionId: string;
  record(outcome: CallSessionFetchOutcome, now: number): CallSessionLookupDecision;
  /** 자동(폴링) 재조회 가능 여부 */
  canAutoRetry(now: number): boolean;
  /** 온라인 복귀·화면 복귀 — 소진·인증 대기·일시 실패 대기 해제(429 대기는 유지) */
  resume(): void;
  /** 다음 조회 가능 시각(대기 없으면 0) */
  backoffUntil(): number;
};

export function createCallSessionLookupHealth(sessionId: string): CallSessionLookupHealth {
  const R = CALL_SESSION_LOOKUP_RETRY;
  let consecutiveTransient = 0;
  let backoffUntil = 0;
  let rateLimitedUntil = 0;
  let exhausted = false;
  let authBlocked = false;
  let firstNotFoundAt: number | null = null;

  return {
    sessionId,
    record(outcome, now) {
      switch (outcome.kind) {
        case "ok":
          consecutiveTransient = 0;
          backoffUntil = 0;
          rateLimitedUntil = 0;
          exhausted = false;
          authBlocked = false;
          firstNotFoundAt = null;
          return { action: "apply", session: outcome.session };
        case "rate_limited":
          rateLimitedUntil = now + outcome.retryAfterMs;
          backoffUntil = Math.max(backoffUntil, rateLimitedUntil);
          return { action: "keep", retryAt: backoffUntil };
        case "auth_required":
          authBlocked = true;
          return { action: "keep", retryAt: null };
        case "transient": {
          consecutiveTransient += 1;
          if (consecutiveTransient >= R.maxConsecutiveTransient) {
            exhausted = true;
            backoffUntil = now + R.transientMaxMs;
            return { action: "keep", retryAt: null };
          }
          const delay = Math.min(R.transientMaxMs, R.transientBaseMs * 2 ** (consecutiveTransient - 1));
          backoffUntil = now + delay;
          return { action: "keep", retryAt: backoffUntil };
        }
        case "not_found": {
          if (firstNotFoundAt == null) {
            firstNotFoundAt = now;
            backoffUntil = now + R.notFoundConfirmGapMs;
            return { action: "keep", retryAt: backoffUntil };
          }
          if (now - firstNotFoundAt < R.notFoundConfirmGapMs) {
            return { action: "keep", retryAt: firstNotFoundAt + R.notFoundConfirmGapMs };
          }
          /* 확정 뒤 자동 재조회 중단 — 화면 복귀·온라인 복귀에서만 1회 재확인 */
          exhausted = true;
          return { action: "not_found_confirmed" };
        }
      }
    },
    canAutoRetry(now) {
      return !exhausted && !authBlocked && now >= backoffUntil;
    },
    resume() {
      exhausted = false;
      authBlocked = false;
      consecutiveTransient = 0;
      backoffUntil = rateLimitedUntil;
    },
    backoffUntil: () => backoffUntil,
  };
}

/**
 * 404 확정 뒤 로컬 표시 플래그를 정리해도 되는가 — 이 sessionId 의 통화가 살아 있다는 근거가 없을 때만.
 * 근거: 이 화면이 그 세션 미디어에 join 해 있음 · 그 세션 media 를 보관한 detached 통화가 있음.
 * (근거가 있으면 미디어·플래그를 유지한다 — 404 만으로 미디어를 내리지 않는다)
 */
export function canClearLocalCallFlagsAfterConfirmedNotFound(args: {
  sessionId: string;
  joinedMediaSessionId: string | null;
  detachedSessionId: string | null;
}): boolean {
  const sid = args.sessionId.trim();
  if (!sid) return false;
  if (args.joinedMediaSessionId?.trim() === sid) return false;
  if (args.detachedSessionId?.trim() === sid) return false;
  return true;
}
