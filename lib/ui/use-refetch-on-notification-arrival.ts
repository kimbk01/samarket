"use client";

/**
 * 새 인앱 알림이 도착하면(종 숫자 증가) 열려 있는 화면을 조용히 다시 읽는다 (H-12 · Owner 2026-11-03).
 * 실기 FAIL: 관리자가 다른 기기에서 충전 신청을 반려해도 열린 화면은 다시 들어가기 전까지 「처리 중」.
 * 처리 결과 알림(충전 완료·반려 등)이 오는 순간 같은 화면이 바뀌게 한다.
 * 알림 숫자 저장소의 소비자일 뿐 — 알림을 만들거나 숫자를 바꾸지 않는다.
 */
import { useEffect, useRef } from "react";
import {
  getNotificationBadgeCountSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";

export function useRefetchOnNotificationArrival(refetch: () => void | Promise<void>): void {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    let last = getNotificationBadgeCountSnapshot()?.total ?? null;
    return subscribeNotificationBadgeCount(() => {
      const next = getNotificationBadgeCountSnapshot()?.total ?? null;
      const arrived = last != null && next != null && next > last;
      last = next;
      if (arrived) void refetchRef.current();
    });
  }, []);
}
