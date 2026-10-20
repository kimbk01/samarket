"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GUARD_STATE_KEY = "__mypageUnsavedLeaveGuard";

/**
 * 입력 중 이탈 확인 (v2 §6.1 T3 — 미저장 확인 시트).
 *
 * 입력이 생기면(`dirty`) 같은 URL 의 기록 1개를 쌓아 두고, 뒤로(헤더 ← · Android 시스템 뒤로 ·
 * 브라우저 뒤로 = 모두 popstate)를 누르면 화면을 떠나지 않고 `confirmOpen` 을 연다.
 * - [계속 작성] `stay()` → 시트만 닫음(가드 기록 재적재 상태 유지).
 * - [나가기] `leave()` → 가드 해제 후 원래 이전 화면으로 이동.
 * 저장 성공 후 `router.replace` 하는 화면은 가드 기록이 그대로 교체되므로 별도 정리 불필요.
 */
export function useMypageUnsavedLeaveGuard(dirty: boolean): {
  confirmOpen: boolean;
  stay: () => void;
  leave: () => void;
} {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const armedRef = useRef(false);
  const releasedRef = useRef(false);
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (typeof window === "undefined") return;
    if (!dirty || armedRef.current || releasedRef.current) return;
    armedRef.current = true;
    window.history.pushState({ ...(window.history.state ?? {}), [GUARD_STATE_KEY]: true }, "", window.location.href);
  }, [dirty]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      if (!armedRef.current || releasedRef.current) return;
      if (!dirtyRef.current) {
        // 입력을 모두 지운 상태 — 가드 없이 그대로 이전 화면으로
        armedRef.current = false;
        releasedRef.current = true;
        window.history.back();
        return;
      }
      // 가드 기록이 빠졌다 → 다시 쌓고 확인 시트
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD_STATE_KEY]: true }, "", window.location.href);
      setConfirmOpen(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const stay = useCallback(() => setConfirmOpen(false), []);

  const leave = useCallback(() => {
    setConfirmOpen(false);
    releasedRef.current = true;
    if (typeof window === "undefined") return;
    // [이전 화면, 이 화면, 가드] → 가드와 이 화면을 함께 지나 이전 화면으로
    window.history.go(armedRef.current ? -2 : -1);
  }, []);

  return { confirmOpen, stay, leave };
}
