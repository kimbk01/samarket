"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 중복 제출 방지 단일 훅 (최종 설계 §1.2, v2.1 §3.3) — in-flight ref + 버튼 비활성용 `pending`.
 *
 * ```ts
 * const { run, pending } = useMypageSubmitGuard();
 * <button disabled={pending} onClick={() => run(async () => save())} />
 * ```
 * 진행 중 재호출은 실행하지 않고 `undefined` 로 끝난다(ref 기준이라 같은 틱 연타도 차단).
 * 작업이 던진 오류는 그대로 전파한다(화면이 오류 토스트를 정함).
 */
export function useMypageSubmitGuard(): {
  run: <T>(task: () => Promise<T> | T) => Promise<T | undefined>;
  pending: boolean;
} {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(task: () => Promise<T> | T): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return await task();
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  return { run, pending };
}
