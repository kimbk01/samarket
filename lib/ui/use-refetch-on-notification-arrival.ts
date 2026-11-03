"use client";

/**
 * 관리자 처리 결과 알림이 도착하면 열려 있는 돈 화면을 조용히 다시 읽는다 (H-12 · 재감사 R1 · Owner 2026-11-03).
 * 이전: 회원 종 숫자 증가만 봄 → 매장 단위 알림(Cash 충전·Coin 출금)은 회원 종 숫자에서 빠져 사장님 화면이 갱신되지 않음(N-3 FAIL).
 * 지금: 알림 Realtime 이 넘기는 「돈 처리 결과」 신호 중 이 화면 범위(회원 / 그 매장)만 받는다.
 * 알림 숫자 저장소·푸시·소리는 건드리지 않는다.
 */
import { useEffect, useRef } from "react";
import { moneyOutcomeMatchesScope, subscribeMoneyOutcome } from "@/lib/notifications/money-outcome-signal";

/** `storeId` 없음 = 회원(포인트) 화면, 있음 = 그 매장 사장님 화면 */
export function useRefetchOnNotificationArrival(
  refetch: () => void | Promise<void>,
  scope: { storeId?: string | null } = {}
): void {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const storeId = scope.storeId?.trim() || null;
  useEffect(
    () =>
      subscribeMoneyOutcome((signal) => {
        if (moneyOutcomeMatchesScope(signal, { storeId })) void refetchRef.current();
      }),
    [storeId]
  );
}
