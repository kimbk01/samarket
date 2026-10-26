/**
 * 동일 키로 동시에 들어온 비동기 작업을 하나의 Promise 로 합칩니다.
 * (폴링 + visibility + 수동 새로고침이 겹칠 때 서버·클라이언트 부하 감소)
 */
const flights = new Map<string, Promise<unknown>>();

/** 스로틀 구간에서도 진행 중이면 같은 Promise 에 합류할 때 사용 */
export function getSingleFlightPromise<T>(key: string): Promise<T> | undefined {
  return flights.get(key) as Promise<T> | undefined;
}

/** 진행 중 단일 비행을 취소하고 다음 호출이 새로 fetch 하도록 함 (채팅 전송 직후 목록 갱신용) */
export function forgetSingleFlight(key: string): void {
  flights.delete(key);
}

/** 키가 조건에 맞는 진행 중 비행을 모두 제거 — 글 등록 직후 목록 무효화 등 */
export function forgetSingleFlightsWhere(predicate: (key: string) => boolean): void {
  for (const k of [...flights.keys()]) {
    if (predicate(k)) flights.delete(k);
  }
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

/**
 * `runSingleFlight` 와 같지만, 진행 중에 들어온 요청은 합류만 하지 않고 진행 중 작업이 끝난 뒤 **1회 더** 실행한
 * 결과를 받는다(뒤따름 1회 — 겹친 요청이 여러 개여도 1회). 진행 중 응답이 그 사이 생긴 변경을 담지 못하는
 * 목록 조회용(D-5 통화 기록: 기록 저장 전에 시작된 조회에 합류해 새 행을 놓침).
 */
export function runSingleFlightWithTrailing<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = flights.get(key) as Promise<T> | undefined;
  if (!existing) return runSingleFlight(key, factory);
  const trailingKey = `${key}::trailing`;
  const queued = flights.get(trailingKey) as Promise<T> | undefined;
  if (queued) return queued;
  const p: Promise<T> = existing
    .catch(() => undefined)
    .then(() => {
      /** 뒤따름이 시작되면 대기 표시를 지운다 — 그 뒤에 온 요청은 이 뒤따름 다음에 다시 1회 */
      if (flights.get(trailingKey) === p) flights.delete(trailingKey);
      return runSingleFlight(key, factory);
    });
  flights.set(trailingKey, p);
  return p;
}

/** dev memory diagnosis — 진행 중 single-flight 키 수 */
export function getSingleFlightInflightCount(): number {
  return flights.size;
}

/**
 * dev — Map 상한 초과 시 오래된 키부터 제거(완료 후에도 남는 stuck 항목 완화).
 * 진행 중 Promise 는 유지하되 초과분만 eviction.
 */
export function pruneSingleFlightDev(): number {
  if (process.env.NODE_ENV !== "development") return 0;
  const max = (() => {
    const raw = Number(process.env.SAMARKET_DEV_SINGLEFLIGHT_MAX_KEYS);
    return Number.isFinite(raw) && raw >= 32 ? Math.floor(raw) : 128;
  })();
  if (flights.size <= max) return 0;
  const overflow = flights.size - max;
  const keys = [...flights.keys()];
  for (let i = 0; i < overflow; i += 1) {
    flights.delete(keys[i]!);
  }
  return overflow;
}
