"use client";

import { usePathname, type ReadonlyURLSearchParams } from "next/navigation";
import { useMemo } from "react";

/**
 * R2-M11 — 방 진입 트리 전용 URL query.
 * `useSearchParams()` 는 가장 가까운 Suspense 경계에서 release 를 막을 수 있어,
 * pathname 갱신 시 `window.location.search` 를 읽는다(동치: callAction·sessionId·msg·origin).
 */
export function useMessengerRoomUrlSearchParams(): ReadonlyURLSearchParams {
  const pathname = usePathname() ?? "";
  return useMemo(() => {
    const raw =
      typeof window === "undefined" ? "" : window.location.search;
    return new URLSearchParams(raw) as unknown as ReadonlyURLSearchParams;
  }, [pathname]);
}
