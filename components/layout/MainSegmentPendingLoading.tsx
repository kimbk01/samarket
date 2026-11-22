"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";
import { isCallSurfaceTransitionPath } from "@/components/route-transition/call-surface-transition-path";
import { isMainTabKeepAliveHubPath } from "@/lib/layout/resolve-main-surface";
import {
  peekTradeMarketProductComposition,
  subscribeTradeMarketProductComposition,
} from "@/lib/trade/marketplace/trade-market-product-composition";

/**
 * `(main)` 구간 `loading.tsx` 공용 — 하위 화면 서버 응답 대기 중 빈 본문 대신 DIBAY 대기 스피너.
 * 설계 `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §2-2 W1 · §3-2.
 *
 * Next 16 은 미리받기로 받아 둔 로딩 경계를 화면 이동 즉시 그린다(`layout-router.js` LoadingBoundary) —
 * 예전 `return null` 은 그 사이 본문이 비었다. 스피너는 450ms 뒤에만 보인다(빠른 전환은 지금과 같음).
 *
 * 그대로 두는 곳(예전과 같은 `null`):
 * - 하단 탭 허브 첫 화면 — `HubRetentionStack` 이 보관 화면·`BottomNavHubSkeleton` 으로 먼저 채운다.
 * - 통화 화면 — 통화 변경 규정(별도 단계 P4).
 * - 거래 목록→상세 카드 연출 중(`skipWhileTradeComposition`) — 연출이 상세 화면을 소유한다(`post/loading.tsx` 계약).
 */
export function MainSegmentPendingLoading({
  skipWhileTradeComposition = false,
}: {
  skipWhileTradeComposition?: boolean;
}) {
  const pathname = usePathname();
  const compositionArmed = useSyncExternalStore(
    subscribeTradeMarketProductComposition,
    () => skipWhileTradeComposition && peekTradeMarketProductComposition() != null,
    () => false
  );
  if (isMainTabKeepAliveHubPath(pathname)) return null;
  if (isCallSurfaceTransitionPath(pathname)) return null;
  if (compositionArmed) return null;
  return <DibayPendingSpinner />;
}
