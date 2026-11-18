/**
 * F8 (설계 2026-11-18 PR-1): 글·스티커 전송 요청 — **응답 본문 읽기까지** 같은 시간 제한 안에서 끝낸다.
 *
 * 공용 `fetchWithTimeout` 은 헤더 도착 뒤 타이머를 해제하므로(타이머 경로) 본문이 늦게 오면 전송 행이 무기한
 * 「전송 중」으로 남을 수 있다. 공용 함수는 다른 호출처가 많아 그대로 두고, 메신저 전송만 이 함수를 쓴다.
 *
 * 결과:
 *  - `res === null`: fetch 예외·시간 초과(헤더 전) → 호출부가 결과 불명(indeterminate)으로 처리
 *  - `res !== null && jsonParsed === false`: 본문 유실·본문 읽기 시간 초과 → `classifyMessengerSendFailure` 가 2xx 면 불명으로 본다
 */
export type MessengerSendFetchJsonResult<T> = {
  res: Response | null;
  json: T | Record<string, never>;
  jsonParsed: boolean;
};

export async function fetchMessengerSendJson<T>(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs: number }
): Promise<MessengerSendFetchJsonResult<T>> {
  const { timeoutMs, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  let rejectDeadline: ((reason: unknown) => void) | null = null;
  /** 본문 스트림이 abort 를 무시하는 환경에서도 같은 기한에 끝나도록 경쟁용 프로미스 */
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  deadline.catch(() => undefined);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectDeadline?.(new Error("messenger_send_timeout"));
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  try {
    let res: Response;
    try {
      res = await Promise.race([fetch(input, { ...rest, signal: controller.signal }), deadline]);
    } catch {
      return { res: null, json: {}, jsonParsed: false };
    }
    if (timedOut) return { res: null, json: {}, jsonParsed: false };
    try {
      const json = ((await Promise.race([res.json(), deadline])) ?? {}) as T;
      return { res, json, jsonParsed: true };
    } catch {
      return { res, json: {}, jsonParsed: false };
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onOuterAbort);
  }
}
