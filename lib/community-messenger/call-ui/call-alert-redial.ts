"use client";

import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

/** [다시 걸기] 대기 상한 — 넘으면 발신하지 않고 버튼만 다시 활성화 */
export const CALL_ALERT_REDIAL_READY_TIMEOUT_MS = 3_000;

/**
 * 이전 통화 정리 완료 대기 — V4 store 가 idle + canStartNewCall 이 될 때까지.
 * 이전 세션 cleanup 중 새 발신이 시작되면 늦은 reset 이 새 통화를 idle 로 지울 수 있다(C-11).
 */
export function waitForCallInAppNoticeRedialReady(
  timeoutMs = CALL_ALERT_REDIAL_READY_TIMEOUT_MS
): Promise<boolean> {
  const ready = () => {
    const st = useCallV4Store.getState();
    return st.canStartNewCall && st.phase === "idle";
  };
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    };
    const unsubscribe = useCallV4Store.subscribe(() => {
      if (ready()) finish(true);
    });
    const timer = setTimeout(() => finish(ready()), timeoutMs);
  });
}
