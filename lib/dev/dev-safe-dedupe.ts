/**
 * Dev Stability — `DEV_SAFE_MODE=1` + `development` 에서만 중복 네트워크/부하 완화.
 * Production 은 `isDevSafeMode()` 가 항상 false.
 */
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

type OkEntry<T> = { at: number; value: T };

const lastOk = new Map<string, OkEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_KEYS = 160;

function trimIfNeeded(): void {
  if (lastOk.size + inflight.size <= MAX_KEYS) return;
  const drop = Math.max(1, Math.floor(lastOk.size / 4));
  let i = 0;
  for (const k of lastOk.keys()) {
    lastOk.delete(k);
    if (++i >= drop) break;
  }
}

const touchAt = new Map<string, number>();

/**
 * 마지막 `rememberDevSafeDedupe` 이후 ttlMs 이내면 true (같은 키의 반복 억제용).
 */
export function shouldSkipDevSafeDedupe(key: string, ttlMs: number): boolean {
  if (!isDevSafeMode()) return false;
  const t = touchAt.get(key);
  return t !== undefined && Date.now() - t < ttlMs;
}

export function rememberDevSafeDedupe(key: string): void {
  if (!isDevSafeMode()) return;
  touchAt.set(key, Date.now());
  if (touchAt.size > MAX_KEYS) {
    const drop = Math.max(1, Math.floor(touchAt.size / 4));
    let i = 0;
    for (const k of touchAt.keys()) {
      touchAt.delete(k);
      if (++i >= drop) break;
    }
  }
}

export type DevSafeSingleFlightOptions = {
  /** true 이면 dev-safe 에서도 항상 fn() 실행 */
  force?: boolean;
  /** 반환값이 true 일 때만 TTL 캐시에 저장 (실패 응답은 캐시하지 않음) */
  onlyCacheIf?: (value: unknown) => boolean;
};

/**
 * ttlMs 안 동일 key 의 완료 결과를 재사용하고, 진행 중이면 동일 Promise 로 합류.
 */
export function runDevSafeSingleFlight<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts?: DevSafeSingleFlightOptions
): Promise<T> {
  if (!isDevSafeMode() || opts?.force) {
    return fn();
  }
  const now = Date.now();
  const cached = lastOk.get(key) as OkEntry<T> | undefined;
  if (cached && now - cached.at < ttlMs) {
    return Promise.resolve(cached.value);
  }
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = fn()
    .then((v) => {
      if (!opts?.onlyCacheIf || opts.onlyCacheIf(v)) {
        lastOk.set(key, { at: Date.now(), value: v });
        trimIfNeeded();
      }
      return v;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
