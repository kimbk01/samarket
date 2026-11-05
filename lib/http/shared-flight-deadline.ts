/**
 * 공유 단일 비행(`runSingleFlight`) 안의 네트워크 작업 마감.
 *
 * - 요청 시작부터 본문 읽기 완료까지 하나의 AbortController 로 묶는다. 마감이 지나면 실제 네트워크를 끊고
 *   `SharedFlightDeadlineError` 로 reject 한다 → 단일 비행 키가 해제되어 다음 호출은 새 요청을 보낸다.
 * - 호출자 취소 signal 은 여기에 연결하지 않는다 — 한 호출자의 이탈이 합류한 다른 호출자의 요청을 끊으면 안 된다.
 *   호출자는 자기 대기만 끊는다(`withAbortSignal` 등).
 * - `AbortError` 와 구분되는 오류다: 호출처가 AbortError 를 「화면 이탈 취소」로 처리하므로,
 *   마감 초과를 취소로 오인해 빈 화면을 그리지 않게 한다.
 * - 마감 뒤에 `work` 가 값을 돌려줘도(본문 실패를 삼킨 경우) 마감 오류로 처리한다 — 잘린 본문을 정상 응답으로 쓰지 않는다.
 */

/**
 * 진입 화면 공유 요청 마감 — 앱 공통 클라이언트 fetch 계약(`fetchWithTimeout` 기본·`/api/me/profile`·읽음 처리 12초)과 같다.
 * 메신저 방 bootstrap p95 critical 2초(`MESSENGER_PERF_REFERENCE_P95_MS.roomBootstrap`)의 6배.
 */
export const ENTRY_SHARED_FLIGHT_DEADLINE_MS = 12_000;

export class SharedFlightDeadlineError extends Error {
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label}: shared flight deadline ${timeoutMs}ms exceeded`);
    this.name = "SharedFlightDeadlineError";
    this.timeoutMs = timeoutMs;
  }
}

export function isSharedFlightDeadlineError(error: unknown): error is SharedFlightDeadlineError {
  return error instanceof SharedFlightDeadlineError;
}

export async function runWithSharedFlightDeadline<T>(
  label: string,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const ac = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);
  try {
    const value = await work(ac.signal);
    if (timedOut) throw new SharedFlightDeadlineError(label, timeoutMs);
    return value;
  } catch (error) {
    if (timedOut) throw new SharedFlightDeadlineError(label, timeoutMs);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
