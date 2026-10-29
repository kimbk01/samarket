import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * v4 PERF-22 — 성능 로그·회귀 가드용 **실제** DB 왕복 수 계측.
 *
 * 요청 단위로 Supabase 클라이언트를 감싸 `.from()`·`.rpc()` 호출(= PostgREST 요청 1회)을 센다.
 * 동작은 원본 클라이언트와 동일 (메서드는 원본에 bind). 같은 클라이언트를 받은 하위 로더의 호출도 포함된다.
 * 고정값(`round_trips: 1` 등) 대신 이 카운트를 기록해 왕복이 늘어나는 회귀를 가드가 볼 수 있게 한다.
 */
export type SupabaseRoundTripCounter<T> = {
  client: T;
  count: () => number;
};

export function countSupabaseRoundTrips<T extends SupabaseClient<any>>(sb: T): SupabaseRoundTripCounter<T> {
  let n = 0;
  const client = new Proxy(sb, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if ((prop === "from" || prop === "rpc") && typeof value === "function") {
        return (...args: unknown[]) => {
          n += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;
  return { client, count: () => n };
}
