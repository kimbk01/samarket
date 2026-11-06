/**
 * Supabase Auth(`/auth/v1/`) 요청 1회의 마감 — 요청 시작부터 본문 읽기 완료까지 하나의 AbortController.
 *
 * - auth-js 2.99.2 는 fetcher 예외를 `AuthRetryableFetchError` 로 분류하고, 이 오류에서는 저장 세션을 지우지 않는다
 *   (`_callRefreshToken`). 마감 초과는 그 경로로만 끝난다 — 로그아웃·비회원 판정으로 바뀌지 않는다.
 * - 갱신 응답이 유실된 뒤 같은 refresh token 재전송은 GoTrue v2.197.0 이 현재 활성 토큰을 돌려준다
 *   (v1: 폐기 토큰이 활성 토큰의 parent · v2: counter 차이 1). 재사용 허용 시간(운영 10초)과 무관하다.
 * - DB·Storage·Functions 요청은 그대로 통과한다 (업로드 등 긴 요청을 끊지 않는다).
 */

/**
 * 운영 근거: auth-js 갱신 재시도 창 30초(`AUTO_REFRESH_TICK_DURATION_MS`) 안에서 멈춘 시도 뒤 재시도가 2회 더 들어가고
 * (0 → 10.2s → 20.6s 시작, 최대 약 30.6s 종료), 진입 공유 요청 마감(`ENTRY_SHARED_FLIGHT_DEADLINE_MS` 12초)보다 먼저 끝난다.
 */
export const SUPABASE_AUTH_REQUEST_DEADLINE_MS = 10_000;

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export class SupabaseAuthRequestDeadlineError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`supabase auth request deadline ${timeoutMs}ms exceeded`);
    this.name = "SupabaseAuthRequestDeadlineError";
    this.timeoutMs = timeoutMs;
  }
}

function requestUrlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isSupabaseAuthRequestUrl(input: RequestInfo | URL): boolean {
  const url = requestUrlOf(input);
  try {
    return new URL(url).pathname.startsWith("/auth/v1/");
  } catch {
    return false;
  }
}

export function createSupabaseAuthDeadlineFetch(
  baseFetch: typeof fetch,
  timeoutMs: number = SUPABASE_AUTH_REQUEST_DEADLINE_MS,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isSupabaseAuthRequestUrl(input)) return baseFetch(input, init);

    const ac = new AbortController();
    let timedOut = false;
    const callerSignal = init?.signal ?? null;
    const onCallerAbort = () => ac.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) ac.abort(callerSignal.reason);
      else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
    const timer = globalThis.setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, timeoutMs);
    try {
      const res = await baseFetch(input, { ...init, signal: ac.signal });
      const body = NULL_BODY_STATUSES.has(res.status) ? null : await res.arrayBuffer();
      if (timedOut) throw new SupabaseAuthRequestDeadlineError(timeoutMs);
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (error) {
      if (timedOut) throw new SupabaseAuthRequestDeadlineError(timeoutMs);
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  };
}
