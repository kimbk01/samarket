"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { MainShellDocumentLoading } from "@/components/layout/MainRouteLoading";

const PhilifeMessengerFromHeaderStack = dynamic(
  () =>
    import("@/components/philife/PhilifeMessengerFromHeaderStack").then(
      (m) => m.PhilifeMessengerFromHeaderStack
    ),
  // FAIL②: 서버 HTML 첫 그림 — 문서 이동(배포 후 첫 탭 등)에서 JS 마운트 전 빈 화면 방지. 동작·트리 변경 없음.
  { ssr: false, loading: () => <MainShellDocumentLoading /> }
);
const TradeHistoryFromHeaderStack = dynamic(
  () =>
    import("@/components/trade/TradeHistoryFromHeaderStack").then((m) => m.TradeHistoryFromHeaderStack),
  // 바깥 래퍼가 풀린 뒤 이 청크를 기다리는 동안에도 같은 로딩 화면(빈 화면으로 되돌아가지 않게).
  { ssr: false, loading: () => <MainShellDocumentLoading /> }
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
