"use client";

import type { ReactNode } from "react";
import { PhilifeMessengerFromHeaderStack } from "@/components/philife/PhilifeMessengerFromHeaderStack";
import { TradeHistoryFromHeaderStack } from "@/components/trade/TradeHistoryFromHeaderStack";

/**
 * C 단계 (Owner 승인 2026-11-10): 두 래퍼는 일반 import — 예전 `next/dynamic({ ssr:false })` 가 셸 전체(헤더·본문·하단 메뉴)를
 * 감싸 서버 HTML 에 메뉴가 없었다. 래퍼 자체는 서버에서 그려도 안전(열림 false 시작·패널 포털은 마운트 후),
 * 무거운 패널 본문은 각 래퍼 안에서 계속 지연 로드(`ssr:false`).
 */

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
