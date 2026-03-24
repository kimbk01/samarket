/**
 * 동일 키로 동시에 들어온 비동기 작업을 하나의 Promise 로 합칩니다.
 * (폴링 + visibility + 수동 새로고침이 겹칠 때 서버·클라이언트 부하 감소)
 */
const flights = new Map<string, Promise<unknown>>();

/** 진행 중 단일 비행을 취소하고 다음 호출이 새로 fetch 하도록 함 (채팅 전송 직후 목록 갱신용) */
export function forgetSingleFlight(key: string): void {
  flights.delete(key);
}

export function runSingleFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = flights.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = factory().finally(() => {
    if (flights.get(key) === p) flights.delete(key);
  }) as Promise<T>;
  flights.set(key, p);
  return p;
}
