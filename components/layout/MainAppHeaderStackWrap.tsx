"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const PhilifeMessengerFromHeaderStack = dynamic(
  () =>
    import("@/components/philife/PhilifeMessengerFromHeaderStack").then(
      (m) => m.PhilifeMessengerFromHeaderStack
    ),
  { ssr: false }
);
const TradeHistoryFromHeaderStack = dynamic(
  () =>
    import("@/components/trade/TradeHistoryFromHeaderStack").then((m) => m.TradeHistoryFromHeaderStack),
  { ssr: false }
);

/**
 * 헤더 메신저·거래내역 풀스택 래퍼.
 *
 * CONTRACT — 하단 메인 허브 간 래퍼 트리 고정 (AppRouteTransition remount 금지).
 * `/stores` 에서도 동일 래퍼를 유지한다. 패널 활성은 각 스택의 `onPath` 게이트.
 * DO NOT: `/stores` 에서 Fragment 로 바꿔 셸을 remount.
 */
export function MainAppHeaderStackWrap({ children }: { children: ReactNode }) {
  return (
    <PhilifeMessengerFromHeaderStack>
      <TradeHistoryFromHeaderStack>{children}</TradeHistoryFromHeaderStack>
    </PhilifeMessengerFromHeaderStack>
  );
}
